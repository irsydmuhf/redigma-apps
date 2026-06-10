"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

export async function submitTask(
  taskId: string,
  enrollmentId: string,
  moduleId: string,
  formData: FormData
) {
  const me = await getCurrentLmsUser();
  if (!me || me.role !== "adv") throw new Error("Tidak punya akses.");

  const admin = createAdminClient();
  const linkUrl = String(formData.get("link_url") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  let screenshotUrl: string | null = null;
  const file = formData.get("screenshot") as File | null;

  if (file && file.size > 0) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `submissions/${enrollmentId}/${taskId}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from("lms-uploads")
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error(`Upload gagal: ${uploadErr.message}`);

    const { data: signed } = await admin.storage
      .from("lms-uploads")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 tahun

    screenshotUrl = signed?.signedUrl ?? null;
  }

  const { error } = await admin.from("lms_task_submissions").insert({
    enrollment_id: enrollmentId,
    task_id: taskId,
    screenshot_url: screenshotUrl,
    link_url: linkUrl,
    notes,
    status: "pending",
  });

  if (error) throw new Error(error.message);

  // Cek apakah semua task di modul ini sudah approved → complete modul
  await admin.rpc("lms_check_module_completion", {
    p_enrollment_id: enrollmentId,
    p_module_id: moduleId,
  });

  redirect(`/lms/module/${moduleId}?tab=tasks&msg=${encodeURIComponent('Task berhasil disubmit, menunggu review Manager')}`);
}

export async function approveSubmission(submissionId: string, moduleId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { data: sub, error: fetchErr } = await admin
    .from("lms_task_submissions")
    .select("enrollment_id, task_id")
    .eq("id", submissionId)
    .single();

  if (fetchErr || !sub) throw new Error("Submission tidak ditemukan.");

  const { error } = await admin
    .from("lms_task_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
      feedback_comment: null,
    })
    .eq("id", submissionId);

  if (error) throw new Error(error.message);

  // Cek module completion setelah approval
  const { data: task } = await admin
    .from("lms_module_tasks")
    .select("module_id")
    .eq("id", sub.task_id)
    .single();

  if (task) {
    await admin.rpc("lms_check_module_completion", {
      p_enrollment_id: sub.enrollment_id,
      p_module_id: task.module_id,
    });
  }

  redirect(`/lms/manager/approvals?msg=${encodeURIComponent('Submission berhasil disetujui')}`);
}

export async function rejectSubmission(submissionId: string, formData: FormData) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const comment = String(formData.get("feedback_comment") ?? "").trim();
  if (!comment) throw new Error("Komentar wajib diisi saat menolak submission.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_task_submissions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id,
      feedback_comment: comment,
    })
    .eq("id", submissionId);

  if (error) throw new Error(error.message);
  redirect(`/lms/manager/approvals?msg=${encodeURIComponent('Submission berhasil ditolak')}`);
}

export async function startPostTest(postTestId: string, enrollmentId: string, moduleId: string) {
  const me = await getCurrentLmsUser();
  if (!me || me.role !== "adv") throw new Error("Tidak punya akses.");

  const admin = createAdminClient();
  const { data: attemptId, error } = await admin.rpc("lms_start_post_test", {
    p_enrollment_id: enrollmentId,
    p_post_test_id: postTestId,
  });

  if (error) throw new Error(error.message);
  redirect(`/lms/module/${moduleId}?tab=posttest`);
}

export async function submitPostTest(
  attemptId: string,
  enrollmentId: string,
  moduleId: string,
  formData: FormData
) {
  const me = await getCurrentLmsUser();
  if (!me || me.role !== "adv") throw new Error("Tidak punya akses.");

  const admin = createAdminClient();

  // Save selected answers
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_")) {
      const answerId = key.replace("answer_", "");
      const optionId = String(value);
      await admin
        .from("lms_post_test_attempt_answers")
        .update({ selected_option_id: optionId })
        .eq("id", answerId);
    }
  }

  const { data: score, error } = await admin.rpc("lms_submit_post_test", {
    p_attempt_id: attemptId,
    p_enrollment_id: enrollmentId,
    p_module_id: moduleId,
  });

  if (error) throw new Error(error.message);
  redirect(`/lms/module/${moduleId}?tab=posttest&score=${score}`);
}
