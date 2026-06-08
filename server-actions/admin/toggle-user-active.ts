"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function toggleUserActive(input: {
  userId: string;
  isActive: boolean;
}) {
  const current = await getCurrentUser();
  if (!current?.isAdmin) {
    return { ok: false as const, error: "Hanya admin yang boleh." };
  }
  if (input.userId === current.id) {
    return {
      ok: false as const,
      error: "Anda tidak bisa mendeaktifkan akun Anda sendiri.",
    };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("user_profiles")
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq("id", input.userId);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true as const };
}
