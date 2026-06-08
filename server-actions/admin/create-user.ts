"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type Role } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type DivisionAssignment = { divisionCode: string; role: Role };
type AliasInput = { roleCode: string; aliasText: string };

export type CreateUserResult =
  | { ok: true; userId: string; aliasErrors?: string[] }
  | { ok: false; error: string };

export async function createUser(input: {
  email: string;
  fullName: string;
  password?: string;
  assignments: DivisionAssignment[];
  aliases?: AliasInput[];
}): Promise<CreateUserResult> {
  const current = await getCurrentUser();
  if (!current?.isAdmin) {
    return { ok: false, error: "Hanya admin yang bisa membuat user baru." };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Email tidak valid." };
  }
  if (input.assignments.length === 0) {
    return { ok: false, error: "Minimal pilih 1 divisi & role." };
  }
  if (input.password && input.password.length < 6) {
    return { ok: false, error: "Password sementara minimal 6 karakter." };
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      email_confirm: true,
      password: input.password || undefined,
      user_metadata: { full_name: input.fullName || null },
    }
  );

  if (createErr || !created?.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Gagal membuat user di Supabase Auth.",
    };
  }

  const userId = created.user.id;

  const { error: profileErr } = await admin
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        email,
        full_name: input.fullName || null,
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (profileErr) {
    return { ok: false, error: profileErr.message };
  }

  const rows = input.assignments.map((a) => ({
    user_id: userId,
    division_code: a.divisionCode,
    role: a.role,
  }));

  const { error: divErr } = await admin
    .from("user_divisions")
    .upsert(rows, { onConflict: "user_id,division_code" });

  if (divErr) {
    return { ok: false, error: divErr.message };
  }

  // Insert alias (opsional). Kalau gagal salah satu, lanjutkan sisanya — kumpulin error.
  const aliasErrors: string[] = [];
  if (input.aliases && input.aliases.length > 0) {
    for (const a of input.aliases) {
      const text = a.aliasText.trim();
      if (!text) continue;
      const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");

      // Cek konflik alias sama di peran yg sama
      const { data: existing } = await admin
        .from("user_role_aliases")
        .select("id, user_id")
        .eq("role_code", a.roleCode)
        .eq("alias_normalized", normalized)
        .maybeSingle();

      if (existing) {
        aliasErrors.push(
          `Alias "${text}" untuk peran '${a.roleCode}' sudah dipakai. Dilewati.`
        );
        continue;
      }

      const { error: aErr } = await admin.from("user_role_aliases").insert({
        user_id: userId,
        role_code: a.roleCode,
        alias_text: text,
        created_by: current.id,
      });
      if (aErr) {
        aliasErrors.push(`${text}: ${aErr.message}`);
      }
    }

    // Auto-link transaksi untuk peran yg punya alias baru
    const rolesAffected = Array.from(new Set(input.aliases.map((a) => a.roleCode)));
    for (const role of rolesAffected) {
      await admin.rpc("relink_transactions_for_user", {
        p_role: role,
        p_user_id: userId,
      });
    }
  }

  revalidatePath("/admin/users");
  return { ok: true, userId, aliasErrors: aliasErrors.length ? aliasErrors : undefined };
}
