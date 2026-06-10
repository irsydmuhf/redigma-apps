"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

function editUrl(programId: string, msg: string) {
  return `/lms/manager/programs/${programId}/edit?msg=${encodeURIComponent(msg)}`;
}

async function requireManagerOrAdmin() {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }
  return me;
}

// ── PROGRAM ──────────────────────────────────────────────────

export async function createProgram(formData: FormData) {
  const me = await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("lms_programs")
    .insert({
      name: String(formData.get("name")).trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      platform: String(formData.get("platform") ?? "other"),
      created_by: me.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/lms/manager/programs/${data.id}/edit?msg=${encodeURIComponent('Program berhasil dibuat')}`);
}

export async function updateProgram(programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("lms_programs")
    .update({
      name: String(formData.get("name")).trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      platform: String(formData.get("platform") ?? "other"),
    })
    .eq("id", programId);

  if (error) throw new Error(error.message);
  redirect(editUrl(programId, 'Program berhasil disimpan'));
}

export async function duplicateProgram(programId: string) {
  const me = await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { data: prog } = await admin
    .from("lms_programs")
    .select(`
      name, description, platform,
      lms_program_phases (
        id, title, order_index, duration_days,
        lms_program_modules (
          id, title, description, order_index, estimated_days,
          lms_module_content (type, content_text, video_url, file_url, file_name, order_index),
          lms_module_tasks (title, description, requires_screenshot, requires_link, order_index)
        )
      )
    `)
    .eq("id", programId)
    .single();

  if (!prog) throw new Error("Program tidak ditemukan.");

  const { data: newProg, error: progErr } = await admin
    .from("lms_programs")
    .insert({
      name: `${prog.name} (Salinan)`,
      description: prog.description,
      platform: prog.platform,
      created_by: me.id,
    })
    .select("id")
    .single();

  if (progErr || !newProg) throw new Error(progErr?.message ?? "Gagal duplikasi.");

  for (const phase of prog.lms_program_phases ?? []) {
    const { data: newPhase } = await admin
      .from("lms_program_phases")
      .insert({
        program_id: newProg.id,
        title: phase.title,
        order_index: phase.order_index,
        duration_days: phase.duration_days,
      })
      .select("id")
      .single();

    if (!newPhase) continue;

    for (const mod of phase.lms_program_modules ?? []) {
      const { data: newMod } = await admin
        .from("lms_program_modules")
        .insert({
          phase_id: newPhase.id,
          title: mod.title,
          description: mod.description,
          order_index: mod.order_index,
          estimated_days: mod.estimated_days,
        })
        .select("id")
        .single();

      if (!newMod) continue;

      if (mod.lms_module_content?.length) {
        await admin.from("lms_module_content").insert(
          mod.lms_module_content.map((c: any) => ({ ...c, id: undefined, module_id: newMod.id }))
        );
      }
      if (mod.lms_module_tasks?.length) {
        await admin.from("lms_module_tasks").insert(
          mod.lms_module_tasks.map((t: any) => ({ ...t, id: undefined, module_id: newMod.id }))
        );
      }
    }
  }

  redirect(`/lms/manager/programs/${newProg.id}/edit?msg=${encodeURIComponent('Program berhasil diduplikasi')}`);
}

// ── PHASES ───────────────────────────────────────────────────

export async function addPhase(programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("lms_program_phases")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();

  await admin.from("lms_program_phases").insert({
    program_id: programId,
    title: String(formData.get("title")).trim(),
    duration_days: formData.get("duration_days") ? Number(formData.get("duration_days")) : null,
    order_index: (last?.order_index ?? -1) + 1,
  });

  redirect(editUrl(programId, 'Phase berhasil ditambahkan'));
}

export async function deletePhase(phaseId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_program_phases").delete().eq("id", phaseId);
  redirect(editUrl(programId, 'Phase berhasil dihapus'));
}

// ── MODULES ──────────────────────────────────────────────────

export async function addModule(phaseId: string, programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("lms_program_modules")
    .select("order_index")
    .eq("phase_id", phaseId)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();

  await admin.from("lms_program_modules").insert({
    phase_id: phaseId,
    title: String(formData.get("title")).trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    estimated_days: Number(formData.get("estimated_days") ?? 1),
    order_index: (last?.order_index ?? -1) + 1,
  });

  redirect(editUrl(programId, 'Modul berhasil ditambahkan'));
}

export async function deleteModule(moduleId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_program_modules").delete().eq("id", moduleId);
  redirect(editUrl(programId, 'Modul berhasil dihapus'));
}

// ── CONTENT ──────────────────────────────────────────────────

export async function addContent(moduleId: string, programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  const type = String(formData.get("type"));

  const { data: last } = await admin
    .from("lms_module_content")
    .select("order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();

  await admin.from("lms_module_content").insert({
    module_id: moduleId,
    type,
    content_text: type === "text" ? String(formData.get("content_text") ?? "").trim() : null,
    video_url: type === "video" ? String(formData.get("video_url") ?? "").trim() : null,
    file_url: type === "file" ? String(formData.get("file_url") ?? "").trim() : null,
    file_name: type === "file" ? String(formData.get("file_name") ?? "").trim() : null,
    order_index: (last?.order_index ?? -1) + 1,
  });

  redirect(editUrl(programId, 'Konten berhasil ditambahkan'));
}

export async function deleteContent(contentId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_module_content").delete().eq("id", contentId);
  redirect(editUrl(programId, 'Konten berhasil dihapus'));
}

// ── TASKS ────────────────────────────────────────────────────

export async function addTask(moduleId: string, programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("lms_module_tasks")
    .select("order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();

  await admin.from("lms_module_tasks").insert({
    module_id: moduleId,
    title: String(formData.get("title")).trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    requires_screenshot: formData.get("requires_screenshot") === "on",
    requires_link: formData.get("requires_link") === "on",
    order_index: (last?.order_index ?? -1) + 1,
  });

  redirect(editUrl(programId, 'Task berhasil ditambahkan'));
}

export async function deleteTask(taskId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_module_tasks").delete().eq("id", taskId);
  redirect(editUrl(programId, 'Task berhasil dihapus'));
}

// ── POST-TEST ─────────────────────────────────────────────────

export async function createPostTest(moduleId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_post_tests").insert({ module_id: moduleId, pass_score: 80, max_attempts: 3 });
  redirect(editUrl(programId, 'Post-test berhasil dibuat'));
}

export async function deletePostTest(postTestId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_post_tests").delete().eq("id", postTestId);
  redirect(editUrl(programId, 'Post-test berhasil dihapus'));
}

export async function addQuestion(postTestId: string, programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("lms_post_test_questions")
    .select("order_index")
    .eq("post_test_id", postTestId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin.from("lms_post_test_questions").insert({
    post_test_id: postTestId,
    question_text: String(formData.get("question_text")).trim(),
    order_index: (last?.order_index ?? -1) + 1,
  });
  redirect(editUrl(programId, 'Soal berhasil ditambahkan'));
}

export async function deleteQuestion(questionId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_post_test_questions").delete().eq("id", questionId);
  redirect(editUrl(programId, 'Soal berhasil dihapus'));
}

export async function addOption(questionId: string, programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("lms_post_test_options")
    .select("order_index")
    .eq("question_id", questionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin.from("lms_post_test_options").insert({
    question_id: questionId,
    option_text: String(formData.get("option_text")).trim(),
    is_correct: formData.get("is_correct") === "on",
    order_index: (last?.order_index ?? -1) + 1,
  });
  redirect(editUrl(programId, 'Pilihan berhasil ditambahkan'));
}

export async function deleteOption(optionId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_post_test_options").delete().eq("id", optionId);
  redirect(editUrl(programId, 'Pilihan berhasil dihapus'));
}

export async function setCorrectOption(optionId: string, questionId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_post_test_options").update({ is_correct: false }).eq("question_id", questionId);
  await admin.from("lms_post_test_options").update({ is_correct: true }).eq("id", optionId);
  redirect(editUrl(programId, 'Jawaban benar berhasil diatur'));
}

// ── MILESTONES ────────────────────────────────────────────────

export async function createMilestone(programId: string, formData: FormData) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("lms_milestones")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  await admin.from("lms_milestones").insert({
    program_id: programId,
    name: String(formData.get("name")).trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    required_modules_completed: Number(formData.get("required_modules_completed")) || 1,
    emoji: String(formData.get("emoji") ?? "🏆").trim() || "🏆",
    order_index: (last?.order_index ?? -1) + 1,
  });
  redirect(editUrl(programId, 'Milestone berhasil ditambahkan'));
}

export async function deleteMilestone(milestoneId: string, programId: string) {
  await requireManagerOrAdmin();
  const admin = createAdminClient();
  await admin.from("lms_milestones").delete().eq("id", milestoneId);
  redirect(editUrl(programId, 'Milestone berhasil dihapus'));
}
