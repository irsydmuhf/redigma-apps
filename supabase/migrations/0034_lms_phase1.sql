-- LMS Phase 1: Auth & Skeleton
-- Semua tabel LMS menggunakan prefix lms_ di schema public
-- agar tidak perlu konfigurasi extra search path di Supabase API.

-- ============================================================
-- TABEL
-- ============================================================

-- Profil user LMS (terpisah dari public.user_profiles redigma-apps)
CREATE TABLE IF NOT EXISTS lms_user_profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text        NOT NULL,
  email      text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('adv', 'manager', 'admin')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Programs (struktur dasar untuk Phase 1; kolom konten ditambah di Phase 2)
CREATE TABLE IF NOT EXISTS lms_programs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  platform    text        NOT NULL DEFAULT 'other',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_archived boolean     NOT NULL DEFAULT false
);

-- Invite links per program
CREATE TABLE IF NOT EXISTS lms_invite_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid        NOT NULL REFERENCES lms_programs(id) ON DELETE CASCADE,
  token      text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enrollments ADV ke program
CREATE TABLE IF NOT EXISTS lms_program_enrollments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id  uuid        NOT NULL REFERENCES lms_programs(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'completed', 'rejected')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, program_id)
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE lms_user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_programs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_invite_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_program_enrollments ENABLE ROW LEVEL SECURITY;

-- Helper function: kembalikan role LMS dari user yang sedang login.
-- SECURITY DEFINER agar tidak rekursi saat policy query tabel yang sama.
CREATE OR REPLACE FUNCTION lms_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM lms_user_profiles WHERE id = auth.uid()
$$;

-- lms_user_profiles
CREATE POLICY "lms: baca profil sendiri"
  ON lms_user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "lms: manager & admin baca semua profil"
  ON lms_user_profiles FOR SELECT TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'));

-- lms_programs
CREATE POLICY "lms: manager & admin CRUD program"
  ON lms_programs FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

CREATE POLICY "lms: adv baca program yang diikuti (active)"
  ON lms_programs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lms_program_enrollments e
      WHERE e.program_id = lms_programs.id
        AND e.user_id    = auth.uid()
        AND e.status     = 'active'
    )
  );

-- lms_invite_links
CREATE POLICY "lms: manager & admin kelola invite links"
  ON lms_invite_links FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));

-- lms_program_enrollments
CREATE POLICY "lms: adv baca enrollment sendiri"
  ON lms_program_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lms: manager & admin CRUD enrollment"
  ON lms_program_enrollments FOR ALL TO authenticated
  USING (lms_my_role() IN ('manager', 'admin'))
  WITH CHECK (lms_my_role() IN ('manager', 'admin'));
