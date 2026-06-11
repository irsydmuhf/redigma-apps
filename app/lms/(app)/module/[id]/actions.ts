"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { notify } from "@/lib/lms/notify";
import { redirect } from "next/navigation";

/** Ambil user_id ADV dari enrollment. */
async function advUserId(admin: ReturnType<typeof createAdminClient>, enrollmentId: string) {
  const { data } = await admin
    .from("lms_program_enrollments")
    .select("user_id")
    .eq("id", enrollmentId)
    .single();
  return data?.user_id as string | undefined;
}

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

  const advId = await advUserId(admin, sub.enrollment_id);
  if (advId) {
    await notify({
      userId: advId,
      type: "submission",
      title: "Task disetujui ✅",
      body: "Salah satu task-mu disetujui Manager.",
      link: task ? `/lms/module/${task.module_id}?tab=tasks` : "/lms/dashboard",
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
  const { data: sub } = await admin
    .from("lms_task_submissions")
    .select("enrollment_id, lms_module_tasks(module_id)")
    .eq("id", submissionId)
    .single();

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

  if (sub) {
    const advId = await advUserId(admin, sub.enrollment_id);
    const taskRel = Array.isArray(sub.lms_module_tasks) ? sub.lms_module_tasks[0] : sub.lms_module_tasks;
    if (advId) {
      await notify({
        userId: advId,
        type: "submission",
        title: "Task perlu diperbaiki",
        body: comment,
        link: taskRel?.module_id ? `/lms/module/${taskRel.module_id}?tab=tasks` : "/lms/dashboard",
      });
    }
  }

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

  // Gagal 3x → notifikasi ke ADV & Manager untuk koordinasi manual
  const { data: attempts } = await admin
    .from("lms_post_test_attempts")
    .select("passed, lms_post_tests(module_id)")
    .eq("enrollment_id", enrollmentId);
  const moduleAttempts = (attempts ?? []).filter((a) => {
    const pt = Array.isArray(a.lms_post_tests) ? a.lms_post_tests[0] : a.lms_post_tests;
    return pt?.module_id === moduleId;
  });
  const anyPassed = moduleAttempts.some((a) => a.passed);
  if (!anyPassed && moduleAttempts.length >= 3) {
    const { data: enr } = await admin
      .from("lms_program_enrollments")
      .select("user_id, lms_programs(name, created_by)")
      .eq("id", enrollmentId)
      .single();
    const { data: mod } = await admin
      .from("lms_program_modules")
      .select("title")
      .eq("id", moduleId)
      .maybeSingle();
    const prog = enr ? (Array.isArray(enr.lms_programs) ? enr.lms_programs[0] : enr.lms_programs) : null;
    const modLabel = mod?.title ? `modul "${mod.title}"` : "sebuah modul";

    if (enr) {
      await notify({
        userId: enr.user_id,
        type: "posttest",
        title: "Post-test gagal 3x",
        body: `Kamu sudah 3x gagal post-test ${modLabel}. Manager akan menghubungimu untuk bantuan.`,
        link: `/lms/module/${moduleId}?tab=posttest`,
      });
    }
    if (prog?.created_by) {
      await notify({
        userId: prog.created_by,
        type: "posttest",
        title: "ADV gagal post-test 3x",
        body: `Seorang ADV di program ${prog.name} gagal 3x post-test ${modLabel}. Perlu koordinasi manual.`,
        link: "/lms/manager/progress",
      });
    }
  }

  redirect(`/lms/module/${moduleId}?tab=posttest&score=${score}`);
}
