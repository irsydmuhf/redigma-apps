import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReportRow = {
  advName: string;
  advEmail: string;
  programName: string;
  status: string;
  progressPct: number;
  completedModules: number;
  totalModules: number;
  avgPostTest: number | null;
  graduationDate: string | null;
};

/** Baris laporan progress ADV (active + completed), opsional difilter per program.
 *  Dipakai bersama oleh halaman reports dan route export Excel/PDF. */
export async function getReportRows(programId?: string | null): Promise<ReportRow[]> {
  const admin = createAdminClient();

  let q = admin
    .from("lms_program_enrollments")
    .select("id, user_id, status, program_id, lms_programs(name)")
    .in("status", ["active", "completed"]);
  if (programId) q = q.eq("program_id", programId);
  const { data: enrolls } = await q;
  const enrollments = enrolls ?? [];
  if (!enrollments.length) return [];

  const enrollIds = enrollments.map((e) => e.id);
  const userIds = [...new Set(enrollments.map((e) => e.user_id))];
  const programIds = [...new Set(enrollments.map((e) => e.program_id))];

  const [{ data: profiles }, { data: progress }, { data: attempts }, { data: milestones }, { data: phaseRows }] =
    await Promise.all([
      admin.from("lms_user_profiles").select("id, full_name, email").in("id", userIds),
      admin.from("lms_module_progress").select("enrollment_id, status").in("enrollment_id", enrollIds),
      admin
        .from("lms_post_test_attempts")
        .select("enrollment_id, score, lms_post_tests(module_id)")
        .eq("passed", true)
        .in("enrollment_id", enrollIds),
      admin
        .from("lms_adv_milestones")
        .select("enrollment_id, approved_at")
        .eq("status", "approved")
        .in("enrollment_id", enrollIds),
      admin.from("lms_program_phases").select("id, program_id").in("program_id", programIds),
    ]);

  // Total modul per program
  const phaseToProgram: Record<string, string> = {};
  for (const ph of phaseRows ?? []) phaseToProgram[(ph as { id: string }).id] = (ph as { program_id: string }).program_id;
  const phaseIds = (phaseRows ?? []).map((p) => (p as { id: string }).id);
  const { data: modRows } = phaseIds.length
    ? await admin.from("lms_program_modules").select("id, phase_id").in("phase_id", phaseIds)
    : { data: [] as { id: string; phase_id: string }[] };
  const totalByProgram: Record<string, number> = {};
  for (const m of modRows ?? []) {
    const pid = phaseToProgram[(m as { phase_id: string }).phase_id];
    if (pid) totalByProgram[pid] = (totalByProgram[pid] ?? 0) + 1;
  }

  const profMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  const doneByEnroll: Record<string, number> = {};
  for (const p of progress ?? []) {
    if (p.status === "completed") doneByEnroll[p.enrollment_id] = (doneByEnroll[p.enrollment_id] ?? 0) + 1;
  }

  // Skor terbaik per modul → rata-rata per enrollment
  const bestScore: Record<string, Record<string, number>> = {};
  for (const a of attempts ?? []) {
    const pt = Array.isArray(a.lms_post_tests) ? a.lms_post_tests[0] : a.lms_post_tests;
    const mid = (pt as { module_id?: string } | null)?.module_id;
    if (!mid) continue;
    const m = (bestScore[a.enrollment_id] ??= {});
    if (!(mid in m) || (a.score ?? 0) > m[mid]) m[mid] = a.score ?? 0;
  }
  const avgByEnroll: Record<string, number | null> = {};
  for (const eid of enrollIds) {
    const scores = Object.values(bestScore[eid] ?? {});
    avgByEnroll[eid] = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }

  // Tanggal lulus (approved_at terbaru)
  const gradByEnroll: Record<string, string> = {};
  for (const ms of milestones ?? []) {
    const at = ms.approved_at as string | null;
    if (!at) continue;
    if (!gradByEnroll[ms.enrollment_id] || at > gradByEnroll[ms.enrollment_id]) gradByEnroll[ms.enrollment_id] = at;
  }

  return enrollments
    .map((e): ReportRow => {
      const prof = profMap[e.user_id];
      const prog = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
      const total = totalByProgram[e.program_id] ?? 0;
      const done = doneByEnroll[e.id] ?? 0;
      return {
        advName: prof?.full_name ?? "—",
        advEmail: prof?.email ?? "",
        programName: prog?.name ?? "—",
        status: e.status,
        completedModules: done,
        totalModules: total,
        progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
        avgPostTest: avgByEnroll[e.id] ?? null,
        graduationDate: gradByEnroll[e.id] ?? null,
      };
    })
    .sort((a, b) => a.advName.localeCompare(b.advName));
}
