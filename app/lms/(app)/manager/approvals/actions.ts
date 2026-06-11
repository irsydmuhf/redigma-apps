"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { generateCertificatePdf } from "@/lib/lms/certificate";
import { notify } from "@/lib/lms/notify";
import { redirect } from "next/navigation";

export async function approveEnrollment(enrollmentId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_program_enrollments")
    .update({
      status: "active",
      approved_at: new Date().toISOString(),
      approved_by: me.id,
    })
    .eq("id", enrollmentId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  // Init module progress untuk ADV yang baru diapprove
  await admin.rpc("lms_init_module_progress", { p_enrollment_id: enrollmentId });

  const { data: enr } = await admin
    .from("lms_program_enrollments")
    .select("user_id, lms_programs(name)")
    .eq("id", enrollmentId)
    .single();
  if (enr) {
    const prog = Array.isArray(enr.lms_programs) ? enr.lms_programs[0] : enr.lms_programs;
    await notify({
      userId: enr.user_id,
      type: "enrollment",
      title: "Pendaftaran disetujui 🎉",
      body: `Kamu sekarang bisa mulai belajar di program ${prog?.name ?? ""}.`,
      link: "/lms/dashboard",
    });
  }

  redirect(`/lms/manager/approvals?msg=${encodeURIComponent('Enrollment berhasil disetujui')}`);
}

export async function rejectEnrollment(enrollmentId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_program_enrollments")
    .update({ status: "rejected" })
    .eq("id", enrollmentId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  const { data: enr } = await admin
    .from("lms_program_enrollments")
    .select("user_id, lms_programs(name)")
    .eq("id", enrollmentId)
    .single();
  if (enr) {
    const prog = Array.isArray(enr.lms_programs) ? enr.lms_programs[0] : enr.lms_programs;
    await notify({
      userId: enr.user_id,
      type: "enrollment",
      title: "Pendaftaran ditolak",
      body: `Pendaftaranmu ke program ${prog?.name ?? ""} belum disetujui. Hubungi Manager untuk info lebih lanjut.`,
      link: "/lms/dashboard",
    });
  }

  redirect(`/lms/manager/approvals?msg=${encodeURIComponent('Enrollment berhasil ditolak')}`);
}

// ── FINAL MILESTONE (KELULUSAN) ───────────────────────────────

/**
 * Setujui milestone final: terbitkan sertifikat PDF, simpan ke storage,
 * tandai milestone 'approved' dan enrollment 'completed'.
 * `redirectTo` = path tujuan setelah selesai (queue atau halaman ADV).
 */
export async function approveMilestone(advMilestoneId: string, redirectTo: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();

  const { data: am } = await admin
    .from("lms_adv_milestones")
    .select("id, status, enrollment_id, milestone_id")
    .eq("id", advMilestoneId)
    .single();

  if (!am) throw new Error("Milestone tidak ditemukan.");
  if (am.status !== "pending_approval") {
    throw new Error("Milestone ini tidak sedang menunggu persetujuan.");
  }

  // Data untuk sertifikat
  const [{ data: ms }, { data: enr }] = await Promise.all([
    admin.from("lms_milestones").select("name").eq("id", am.milestone_id).single(),
    admin.from("lms_program_enrollments").select("user_id, program_id").eq("id", am.enrollment_id).single(),
  ]);
  if (!enr) throw new Error("Enrollment tidak ditemukan.");

  const [{ data: prog }, { data: adv }] = await Promise.all([
    admin.from("lms_programs").select("name").eq("id", enr.program_id).single(),
    admin.from("lms_user_profiles").select("full_name").eq("id", enr.user_id).single(),
  ]);

  const pdf = await generateCertificatePdf({
    advName: adv?.full_name ?? "ADV",
    programName: prog?.name ?? "Program",
    milestoneName: ms?.name ?? "Kelulusan",
    managerName: me.fullName,
    dateText: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
  });

  const path = `certificates/${am.enrollment_id}/${am.milestone_id}.pdf`;
  const { error: upErr } = await admin.storage
    .from("lms-uploads")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`Upload sertifikat gagal: ${upErr.message}`);

  const { data: signed } = await admin.storage
    .from("lms-uploads")
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 tahun

  const { error } = await admin
    .from("lms_adv_milestones")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: me.id,
      certificate_url: signed?.signedUrl ?? null,
    })
    .eq("id", advMilestoneId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  // Kelulusan → enrollment selesai
  await admin
    .from("lms_program_enrollments")
    .update({ status: "completed" })
    .eq("id", am.enrollment_id);

  await notify({
    userId: enr.user_id,
    type: "milestone",
    title: "Selamat, kamu lulus! 🎓",
    body: `Sertifikat untuk "${ms?.name ?? "Kelulusan"}" sudah diterbitkan. Unduh di dashboard.`,
    link: "/lms/dashboard",
  });

  redirect(`${redirectTo}?msg=${encodeURIComponent("Kelulusan disetujui & sertifikat diterbitkan")}`);
}

export async function rejectMilestone(advMilestoneId: string, redirectTo: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { data: am } = await admin
    .from("lms_adv_milestones")
    .select("enrollment_id")
    .eq("id", advMilestoneId)
    .single();

  const { error } = await admin
    .from("lms_adv_milestones")
    .update({ status: "rejected" })
    .eq("id", advMilestoneId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  if (am) {
    const { data: enr } = await admin
      .from("lms_program_enrollments")
      .select("user_id")
      .eq("id", am.enrollment_id)
      .single();
    if (enr) {
      await notify({
        userId: enr.user_id,
        type: "milestone",
        title: "Pengajuan kelulusan ditolak",
        body: "Pengajuan kelulusanmu belum disetujui Manager. Hubungi Manager untuk info lebih lanjut.",
        link: "/lms/dashboard",
      });
    }
  }

  redirect(`${redirectTo}?msg=${encodeURIComponent("Pengajuan kelulusan ditolak")}`);
}
