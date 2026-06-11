-- ============================================================
-- Phase 7: Notifikasi in-app
-- ============================================================

CREATE TABLE IF NOT EXISTS lms_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,        -- enrollment | submission | milestone | posttest | at_risk
  title      text NOT NULL,
  body       text,
  link       text,                 -- path in-app tujuan saat notif diklik
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lms_notifications_user_idx
  ON lms_notifications (user_id, is_read, created_at DESC);

ALTER TABLE lms_notifications ENABLE ROW LEVEL SECURITY;

-- User hanya bisa lihat & menandai-baca notifikasinya sendiri.
DROP POLICY IF EXISTS notif_select ON lms_notifications;
CREATE POLICY notif_select ON lms_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_update ON lms_notifications;
CREATE POLICY notif_update ON lms_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Insert dilakukan lewat service role (server action), jadi tak perlu policy insert.
