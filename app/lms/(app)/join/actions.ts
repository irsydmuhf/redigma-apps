"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { notifyNewEnrollment } from "@/lib/lms/notify";
import { redirect } from "next/navigation";

export async function joinProgram(formData: FormData) {
  const me = await getCurrentLmsUser();
  if (!me) redirect("/lms/login");

  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/lms/join?error=token-kosong");

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("lms_invite_links")
    .select("id, program_id, expires_at, is_active, lms_programs(name)")
    .eq("token", token)
    .single();

  if (!link || !link.is_active) redirect("/lms/join?error=token-tidak-valid");
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    redirect("/lms/join?error=token-kadaluarsa");
  }

  // Cek apakah sudah aktif di program ini
  const { data: existing } = await admin
    .from("lms_program_enrollments")
    .select("id, status")
    .eq("user_id", me.id)
    .eq("program_id", link.program_id)
    .single();

  if (existing?.status === "active") redirect("/lms/join?error=sudah-aktif");
  if (existing?.status === "pending") redirect("/lms/join?error=sudah-menunggu");

  await admin.from("lms_program_enrollments").upsert(
    {
      user_id: me.id,
      program_id: link.program_id,
      status: "pending",
      enrolled_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
    },
    { onConflict: "user_id,program_id" }
  );

  await notifyNewEnrollment(link.program_id, me.id);

  redirect("/lms/dashboard?joined=true");
}
