-- ============================================================
-- Phase 8: Status aktif/nonaktif user LMS
-- ============================================================
-- User nonaktif tidak bisa mengakses LMS (dicek di getCurrentLmsUser).

ALTER TABLE lms_user_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
