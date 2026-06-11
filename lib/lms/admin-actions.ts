"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

const USERS_PATH = "/lms/admin/users";

async function requireAdmin() {
  const me = await getCurrentLmsUser();
  if (!me || me.role !== "admin") {
    throw new Error("Hanya admin yang dapat mengelola pengguna.");
  }
  return me;
}

function back(msg: string) {
  redirect(`${USERS_PATH}?msg=${encodeURIComponent(msg)}`);
}

/** Cegah org lockout: jangan nonaktifkan/hapus admin AKTIF terakhir. */
async function assertNotLastActiveAdmin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data: target } = await admin
    .from("lms_user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (target?.role !== "admin") return;
  const { count } = await admin
    .from("lms_user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("id", userId);
  if ((count ?? 0) === 0) {
    throw new Error("Tidak bisa menonaktifkan/menghapus admin aktif terakhir.");
  }
}

/** Aktifkan/nonaktifkan akun. User nonaktif tidak bisa akses LMS. */
export async function setUserActive(userId: string, active: boolean) {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("Tidak bisa menonaktifkan akun sendiri.");

  const admin = createAdminClient();
  if (!active) await assertNotLastActiveAdmin(admin, userId);
  const { error } = await admin
    .from("lms_user_profiles")
    .update({ is_active: active })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  back(active ? "Akun diaktifkan." : "Akun dinonaktifkan.");
}

/** Hapus user permanen (cascade ke enrollment, progress, dll. via FK). */
export async function deleteLmsUser(userId: string) {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("Tidak bisa menghapus akun sendiri.");

  const admin = createAdminClient();
  await assertNotLastActiveAdmin(admin, userId);
  // Hapus auth user → cascade ke lms_user_profiles & data terkait.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  back("Pengguna berhasil dihapus.");
}

/** Kirim email reset password via Supabase Auth. */
export async function resetUserPassword(userId: string) {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("lms_user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.email) throw new Error("Email pengguna tidak ditemukan.");

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const { error } = await admin.auth.resetPasswordForEmail(profile.email as string, {
    redirectTo: base ? `${base}/lms/login` : undefined,
  });
  if (error) throw new Error(error.message);

  back("Email reset password telah dikirim.");
}
