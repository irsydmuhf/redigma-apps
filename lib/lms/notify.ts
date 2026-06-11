import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotifType = "enrollment" | "submission" | "milestone" | "posttest" | "at_risk";

export type NotifInput = {
  userId: string;
  type: NotifType;
  title: string;
  body?: string | null;
  link?: string | null;
};

/** Sisipkan satu/banyak notifikasi in-app. Tidak melempar error agar tidak
 *  menggagalkan aksi utama jika notifikasi gagal disimpan. */
export async function notify(input: NotifInput | NotifInput[]): Promise<void> {
  const rows = (Array.isArray(input) ? input : [input])
    .filter((n) => n.userId)
    .map((n) => ({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    }));
  if (!rows.length) return;
  try {
    const admin = createAdminClient();
    await admin.from("lms_notifications").insert(rows);
  } catch (e) {
    console.error("notify gagal:", e);
  }
}

/** Notifikasi ke manager pemilik program saat ada pendaftaran ADV baru. */
export async function notifyNewEnrollment(programId: string, advUserId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: prog }, { data: adv }] = await Promise.all([
    admin.from("lms_programs").select("name, created_by").eq("id", programId).single(),
    admin.from("lms_user_profiles").select("full_name").eq("id", advUserId).maybeSingle(),
  ]);
  if (!prog?.created_by) return;
  await notify({
    userId: prog.created_by,
    type: "enrollment",
    title: "Pendaftaran ADV baru",
    body: `${adv?.full_name ?? "Seorang ADV"} mendaftar ke program ${prog.name}.`,
    link: "/lms/manager/approvals",
  });
}
