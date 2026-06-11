import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type LmsRole = "adv" | "manager" | "admin";

export type LmsUser = {
  id: string;
  email: string;
  fullName: string;
  role: LmsRole;
  avatarUrl: string | null;
};

export const getCurrentLmsUser = cache(async (): Promise<LmsUser | null> => {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from("lms_user_profiles")
    .select("id, email, full_name, role, avatar_url, is_active")
    .eq("id", session.user.id)
    .single();

  if (!profile) return null;
  // User dinonaktifkan admin → tidak boleh akses LMS.
  if (profile.is_active === false) return null;

  return {
    id: profile.id as string,
    email: profile.email as string,
    fullName: profile.full_name as string,
    role: profile.role as LmsRole,
    avatarUrl: (profile.avatar_url as string | null) ?? null,
  };
});
