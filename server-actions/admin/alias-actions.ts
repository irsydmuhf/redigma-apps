"use server";

/**
 * Server actions untuk sistem Alias (matching nama Excel → akun).
 *
 * Hak akses (sesuai RLS migration 0031):
 *   - Admin: full access semua alias
 *   - Head/SPV: edit alias anggota divisi sendiri, kecuali diri sendiri
 *   - Staff/Direksi: read-only
 *
 * Semua action di sini PAKAI createAdminClient supaya bypass RLS — tapi
 * kita validasi manual lewat getCurrentUser() di awal action.
 * Alasannya: RLS untuk INSERT pakai check yg kompleks; lebih simpel
 * validate di server action.
 */

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export type AliasResult =
  | { ok: true; aliasId?: number; relinked?: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------
// Helper: cek apakah current user boleh ubah alias user lain di peran ini
// ---------------------------------------------------------------------
async function canEditAlias(targetUserId: string, roleCode: string) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Belum login." };

  if (me.isAdmin) return { ok: true as const, me };

  // Head/SPV boleh edit anggota divisi yg relevan untuk peran ini,
  // tapi NGGAK boleh edit diri sendiri (cegah self-deal).
  if (targetUserId === me.id) {
    return {
      ok: false as const,
      error: "Anda tidak boleh ubah alias diri sendiri. Hubungi Admin/atasan.",
    };
  }

  const admin = createAdminClient();
  const { data: roleCol } = await admin
    .from("crm_role_columns")
    .select("divisions")
    .eq("code", roleCode)
    .single();

  if (!roleCol) {
    return { ok: false as const, error: `Peran '${roleCode}' tidak dikenal.` };
  }

  const relevantDivs = (roleCol.divisions as string[]) ?? [];

  const myHeadSpvDivs = me.divisions
    .filter((d) => d.role === "head" || d.role === "spv")
    .map((d) => d.divisionCode);

  const hasAuthority = myHeadSpvDivs.some((d) => relevantDivs.includes(d));
  if (!hasAuthority) {
    return {
      ok: false as const,
      error: "Anda bukan Head/SPV untuk divisi peran ini.",
    };
  }

  // Pastikan target user benar-benar anggota divisi yg relevan
  const { data: targetDivs } = await admin
    .from("user_divisions")
    .select("division_code")
    .eq("user_id", targetUserId);

  const targetCodes = (targetDivs ?? []).map((d) => d.division_code as string);
  const isMember = targetCodes.some((d) => relevantDivs.includes(d));
  if (!isMember) {
    return {
      ok: false as const,
      error: "User target bukan anggota divisi peran ini.",
    };
  }

  return { ok: true as const, me };
}

// ---------------------------------------------------------------------
// addAlias — tambah 1 alias
// ---------------------------------------------------------------------
export async function addAlias(input: {
  userId: string;
  roleCode: string;
  aliasText: string;
  validFrom?: string | null;
  validTo?: string | null;
  notes?: string | null;
  autoRelink?: boolean;
}): Promise<AliasResult> {
  const aliasText = input.aliasText.trim();
  if (!aliasText) return { ok: false, error: "Alias tidak boleh kosong." };

  const auth = await canEditAlias(input.userId, input.roleCode);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  // Cek duplikat (alias_normalized + role_code) untuk masa berlaku overlap
  const normalized = aliasText.toLowerCase().trim().replace(/\s+/g, " ");
  const { data: existing } = await admin
    .from("user_role_aliases")
    .select("id, user_id, alias_text, user_profiles!inner(email, full_name)")
    .eq("role_code", input.roleCode)
    .eq("alias_normalized", normalized)
    .maybeSingle();

  if (existing && existing.user_id !== input.userId) {
    const owner = Array.isArray(existing.user_profiles)
      ? existing.user_profiles[0]
      : existing.user_profiles;
    return {
      ok: false,
      error: `Alias "${aliasText}" untuk peran '${input.roleCode}' sudah dipakai oleh ${owner?.full_name || owner?.email || "akun lain"}.`,
    };
  }

  // Insert
  const { data: created, error } = await admin
    .from("user_role_aliases")
    .insert({
      user_id: input.userId,
      role_code: input.roleCode,
      alias_text: aliasText,
      valid_from: input.validFrom || null,
      valid_to: input.validTo || null,
      notes: input.notes || null,
      created_by: auth.me.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Auto-relink transaksi (default true)
  let relinked = 0;
  if (input.autoRelink !== false) {
    const { data: linkRes } = await admin.rpc(
      "relink_transactions_for_user",
      { p_role: input.roleCode, p_user_id: input.userId }
    );
    relinked = (linkRes as number) ?? 0;
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.userId}`);
  revalidatePath("/admin/crm-sync/perlu-ditinjau");

  return { ok: true, aliasId: created.id as number, relinked };
}

// ---------------------------------------------------------------------
// removeAlias — hapus 1 alias
// ---------------------------------------------------------------------
export async function removeAlias(input: {
  aliasId: number;
}): Promise<AliasResult> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("user_role_aliases")
    .select("user_id, role_code")
    .eq("id", input.aliasId)
    .single();

  if (!row) return { ok: false, error: "Alias tidak ditemukan." };

  const auth = await canEditAlias(
    row.user_id as string,
    row.role_code as string
  );
  if (!auth.ok) return auth;

  const { error } = await admin
    .from("user_role_aliases")
    .delete()
    .eq("id", input.aliasId);

  if (error) return { ok: false, error: error.message };

  // Re-link supaya transaksi yg pakai alias ini lepas dari user
  const { data: linkRes } = await admin.rpc(
    "relink_transactions_for_user",
    { p_role: row.role_code, p_user_id: row.user_id }
  );

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${row.user_id}`);
  revalidatePath("/admin/crm-sync/perlu-ditinjau");

  return { ok: true, relinked: (linkRes as number) ?? 0 };
}

// ---------------------------------------------------------------------
// transferAliases — saat user dinonaktifkan, transfer alias ke pengganti
// dengan batas tanggal (sebelum cutoff = milik lama, mulai cutoff = baru)
// ---------------------------------------------------------------------
export async function transferAliases(input: {
  fromUserId: string;
  toUserId: string | null; // null = tidak ada pengganti
  cutoffDate: string; // YYYY-MM-DD
  roleCodes?: string[]; // kalau kosong: semua peran
}): Promise<{ ok: true; transferred: number } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Belum login." };
  if (!me.isAdmin) {
    return {
      ok: false,
      error: "Hanya Admin Data IT yang bisa transfer alias.",
    };
  }

  const admin = createAdminClient();

  // Ambil alias yg masih aktif dari user lama
  let q = admin
    .from("user_role_aliases")
    .select("id, role_code, alias_text, valid_from, valid_to")
    .eq("user_id", input.fromUserId);

  if (input.roleCodes && input.roleCodes.length > 0) {
    q = q.in("role_code", input.roleCodes);
  }

  const { data: oldAliases } = await q;
  if (!oldAliases || oldAliases.length === 0) {
    return { ok: true, transferred: 0 };
  }

  let transferred = 0;
  const cutoff = input.cutoffDate;
  const dayBefore = new Date(cutoff);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const cutoffMinusOne = dayBefore.toISOString().slice(0, 10);

  for (const a of oldAliases) {
    // Tutup alias lama per cutoff-1
    await admin
      .from("user_role_aliases")
      .update({ valid_to: cutoffMinusOne })
      .eq("id", a.id);

    // Kalau ada pengganti: bikin alias baru di akun pengganti mulai cutoff
    if (input.toUserId) {
      await admin.from("user_role_aliases").insert({
        user_id: input.toUserId,
        role_code: a.role_code,
        alias_text: a.alias_text,
        valid_from: cutoff,
        valid_to: null,
        notes: `Transfer dari user ${input.fromUserId} per ${cutoff}`,
        created_by: me.id,
      });
      transferred += 1;
    }
  }

  // Re-link transaksi untuk semua peran yg kena
  const rolesAffected = Array.from(
    new Set(oldAliases.map((a) => a.role_code as string))
  );
  for (const role of rolesAffected) {
    await admin.rpc("relink_transactions_for_role", { p_role: role });
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.fromUserId}`);
  if (input.toUserId)
    revalidatePath(`/admin/users/${input.toUserId}`);

  return { ok: true, transferred };
}

// ---------------------------------------------------------------------
// relinkAllForRole — Admin trigger re-scan semua transaksi 1 peran
// (dipakai di Bulk Setup Wizard setelah selesai map nama)
// ---------------------------------------------------------------------
export async function relinkAllForRole(
  roleCode: string
): Promise<{ ok: true; matched: number; unmatched: number } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    return { ok: false, error: "Hanya Admin yang boleh trigger re-link massal." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("relink_transactions_for_role", {
    p_role: roleCode,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/setup-alias");
  revalidatePath("/admin/crm-sync/perlu-ditinjau");
  return {
    ok: true,
    matched: (row?.matched as number) ?? 0,
    unmatched: (row?.unmatched as number) ?? 0,
  };
}

// ---------------------------------------------------------------------
// toggleRoleColumn — aktifkan/nonaktifkan peran (CRM, Live, Content, dll)
// ---------------------------------------------------------------------
export async function toggleRoleColumn(input: {
  code: string;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    return { ok: false, error: "Hanya Admin yang boleh atur peran." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_role_columns")
    .update({ is_active: input.isActive })
    .eq("code", input.code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/role-columns");
  return { ok: true };
}

// ---------------------------------------------------------------------
// updateRoleColumnLabel — edit nama tampilan peran
// ---------------------------------------------------------------------
export async function updateRoleColumnLabel(input: {
  code: string;
  label: string;
  excelColumnHint?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me?.isAdmin) {
    return { ok: false, error: "Hanya Admin yang boleh edit peran." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_role_columns")
    .update({
      label: input.label,
      excel_column_hint: input.excelColumnHint ?? null,
    })
    .eq("code", input.code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/role-columns");
  return { ok: true };
}

// ---------------------------------------------------------------------
// getExcelNamesForRole — buat popup "Pilih dari Data"
// ---------------------------------------------------------------------
export async function getExcelNamesForRole(roleCode: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_excel_names_for_role", {
    p_role: roleCode,
  });
  if (error) {
    console.error("getExcelNamesForRole error:", error);
    return [];
  }
  return (data ?? []) as Array<{
    raw_name: string;
    transaction_count: number;
    total_amount: number;
    linked_user_id: string | null;
    linked_user_email: string | null;
    linked_user_name: string | null;
    last_seen: string | null;
  }>;
}

// ---------------------------------------------------------------------
// getUnlinkedNames — untuk Inbox Perlu Ditinjau
// ---------------------------------------------------------------------
export async function getUnlinkedNames(roleCode: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_unlinked_names", {
    p_role: roleCode,
  });
  if (error) {
    console.error("getUnlinkedNames error:", error);
    return [];
  }
  return (data ?? []) as Array<{
    raw_name: string;
    transaction_count: number;
    total_amount: number;
    first_seen: string | null;
    last_seen: string | null;
  }>;
}
