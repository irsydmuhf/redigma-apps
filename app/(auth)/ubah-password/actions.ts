"use server";

import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function updatePassword(newPassword: string): Promise<Result> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "Password minimal 6 karakter." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
