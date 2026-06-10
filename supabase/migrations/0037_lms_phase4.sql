-- ============================================================
-- Phase 4: Post-Test
-- ============================================================

-- Post-test definition (one per module)
CREATE TABLE IF NOT EXISTS lms_post_tests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    uuid NOT NULL REFERENCES lms_program_modules(id) ON DELETE CASCADE,
  pass_score   int  NOT NULL DEFAULT 80,
  max_attempts int  NOT NULL DEFAULT 3,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(module_id)
);

-- Questions
CREATE TABLE IF NOT EXISTS lms_post_test_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_test_id uuid NOT NULL REFERENCES lms_post_tests(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  order_index  int  NOT NULL DEFAULT 0
);

-- Answer options per question
CREATE TABLE IF NOT EXISTS lms_post_test_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES lms_post_test_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,
  order_index int NOT NULL DEFAULT 0
);

-- ADV attempts
CREATE TABLE IF NOT EXISTS lms_post_test_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES lms_program_enrollments(id) ON DELETE CASCADE,
  post_test_id   uuid NOT NULL REFERENCES lms_post_tests(id) ON DELETE CASCADE,
  attempt_number int  NOT NULL DEFAULT 1,
  started_at     timestamptz DEFAULT now(),
  submitted_at   timestamptz,
  score          int,
  passed         boolean
);

-- Snapshotted answers per attempt
CREATE TABLE IF NOT EXISTS lms_post_test_attempt_answers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id           uuid NOT NULL REFERENCES lms_post_test_attempts(id) ON DELETE CASCADE,
  question_id          uuid NOT NULL REFERENCES lms_post_test_questions(id),
  question_text        text NOT NULL,
  selected_option_id   uuid REFERENCES lms_post_test_options(id),
  selected_option_text text
);

-- RLS
ALTER TABLE lms_post_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_post_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_post_test_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_post_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_post_test_attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_select" ON lms_post_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "pt_write"  ON lms_post_tests FOR ALL USING (lms_my_role() IN ('manager','admin'));

CREATE POLICY "ptq_select" ON lms_post_test_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ptq_write"  ON lms_post_test_questions FOR ALL USING (lms_my_role() IN ('manager','admin'));

CREATE POLICY "pto_select" ON lms_post_test_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "pto_write"  ON lms_post_test_options FOR ALL USING (lms_my_role() IN ('manager','admin'));

CREATE POLICY "pta_select" ON lms_post_test_attempts FOR SELECT TO authenticated USING (
  lms_my_role() IN ('manager','admin') OR
  enrollment_id IN (SELECT id FROM lms_program_enrollments WHERE user_id = auth.uid())
);

CREATE POLICY "ptaa_select" ON lms_post_test_attempt_answers FOR SELECT TO authenticated USING (
  lms_my_role() IN ('manager','admin') OR
  attempt_id IN (
    SELECT a.id FROM lms_post_test_attempts a
    JOIN lms_program_enrollments e ON e.id = a.enrollment_id
    WHERE e.user_id = auth.uid()
  )
);

-- ── Functions ────────────────────────────────────────────────

-- Start post-test: create attempt + snapshot questions
CREATE OR REPLACE FUNCTION lms_start_post_test(p_enrollment_id uuid, p_post_test_id uuid)
RETURNS uuid AS $$
DECLARE
  v_attempt_id     uuid;
  v_attempt_number int;
BEGIN
  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_number
  FROM lms_post_test_attempts
  WHERE enrollment_id = p_enrollment_id AND post_test_id = p_post_test_id;

  INSERT INTO lms_post_test_attempts (enrollment_id, post_test_id, attempt_number)
  VALUES (p_enrollment_id, p_post_test_id, v_attempt_number)
  RETURNING id INTO v_attempt_id;

  INSERT INTO lms_post_test_attempt_answers (attempt_id, question_id, question_text)
  SELECT v_attempt_id, q.id, q.question_text
  FROM lms_post_test_questions q
  WHERE q.post_test_id = p_post_test_id
  ORDER BY q.order_index;

  RETURN v_attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit post-test: calculate score + trigger module completion
CREATE OR REPLACE FUNCTION lms_submit_post_test(p_attempt_id uuid, p_enrollment_id uuid, p_module_id uuid)
RETURNS int AS $$
DECLARE
  v_total      int;
  v_correct    int;
  v_score      int;
  v_passed     boolean;
  v_pass_score int;
BEGIN
  SELECT pt.pass_score INTO v_pass_score
  FROM lms_post_test_attempts a
  JOIN lms_post_tests pt ON pt.id = a.post_test_id
  WHERE a.id = p_attempt_id;

  SELECT COUNT(*) INTO v_total
  FROM lms_post_test_attempt_answers WHERE attempt_id = p_attempt_id;

  SELECT COUNT(*) INTO v_correct
  FROM lms_post_test_attempt_answers ans
  JOIN lms_post_test_options opt ON opt.id = ans.selected_option_id
  WHERE ans.attempt_id = p_attempt_id AND opt.is_correct = true;

  v_score  := CASE WHEN v_total = 0 THEN 0 ELSE ROUND((v_correct::float / v_total) * 100) END;
  v_passed := v_score >= COALESCE(v_pass_score, 80);

  UPDATE lms_post_test_attempts
  SET submitted_at = now(), score = v_score, passed = v_passed
  WHERE id = p_attempt_id;

  IF v_passed THEN
    PERFORM lms_check_module_completion(p_enrollment_id, p_module_id);
  END IF;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update lms_check_module_completion to check post-test
CREATE OR REPLACE FUNCTION lms_check_module_completion(p_enrollment_id uuid, p_module_id uuid)
RETURNS void AS $$
DECLARE
  v_total_tasks    int;
  v_approved_tasks int;
  v_post_test_id   uuid;
  v_passed_count   int;
BEGIN
  SELECT COUNT(*) INTO v_total_tasks FROM lms_module_tasks WHERE module_id = p_module_id;

  SELECT COUNT(*) INTO v_approved_tasks
  FROM lms_task_submissions
  WHERE enrollment_id = p_enrollment_id
    AND task_id IN (SELECT id FROM lms_module_tasks WHERE module_id = p_module_id)
    AND status = 'approved';

  -- Not all tasks approved yet
  IF v_total_tasks > 0 AND v_approved_tasks < v_total_tasks THEN RETURN; END IF;

  -- Check if post-test required
  SELECT id INTO v_post_test_id FROM lms_post_tests WHERE module_id = p_module_id;

  IF v_post_test_id IS NULL THEN
    PERFORM lms_complete_module(p_enrollment_id, p_module_id);
    RETURN;
  END IF;

  -- Check if post-test passed
  SELECT COUNT(*) INTO v_passed_count
  FROM lms_post_test_attempts
  WHERE enrollment_id = p_enrollment_id AND post_test_id = v_post_test_id AND passed = true;

  IF v_passed_count > 0 THEN
    PERFORM lms_complete_module(p_enrollment_id, p_module_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
