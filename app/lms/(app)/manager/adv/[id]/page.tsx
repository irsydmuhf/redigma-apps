import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Clock, AlertTriangle, CheckCircle2, XCircle, Lock, PlayCircle,
  FileText, ExternalLink, Image as ImageIcon, Award, Download,
} from "lucide-react";
import { summarizeEnrollment, moduleOf, sortByCurriculum, nested } from "@/lib/lms/progress";
import { FlashMessage } from "@/components/lms/ui/flash-message";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { approveMilestone, rejectMilestone } from "@/app/lms/(app)/manager/approvals/actions";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}

const DAY_MS = 86_400_000;

export default async function AdvDetailPage({ params, searchParams }: Props) {
  const { id: enrollmentId } = await params;
  const { msg } = await searchParams;
  const admin = createAdminClient();

  const { data: enrollment } = await admin
    .from("lms_program_enrollments")
    .select("id, user_id, status, enrolled_at, approved_at, program_id, lms_programs(id, name)")
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) notFound();

  const program = nested<any>(enrollment.lms_programs);

  const [{ data: profile }, { data: progressRows }, { data: attempts }, { data: submissions }, { data: phases }] =
    await Promise.all([
      admin.from("lms_user_profiles").select("full_name, email").eq("id", enrollment.user_id).maybeSingle(),
      admin
        .from("lms_module_progress")
        .select(`
          module_id, status, started_at, completed_at,
          lms_program_modules(id, title, order_index, estimated_days, lms_program_phases(order_index))
        `)
        .eq("enrollment_id", enrollmentId),
      admin
        .from("lms_post_test_attempts")
        .select("score, passed, attempt_number, submitted_at, lms_post_tests(module_id)")
        .eq("enrollment_id", enrollmentId)
        .order("attempt_number", { ascending: true }),
      admin
        .from("lms_task_submissions")
        .select("id, status, submitted_at, feedback_comment, screenshot_url, link_url, notes, lms_module_tasks(id, title, module_id)")
        .eq("enrollment_id", enrollmentId)
        .order("submitted_at", { ascending: false }),
      admin.from("lms_program_phases").select("id").eq("program_id", enrollment.program_id),
    ]);

  const phaseIds = (phases ?? []).map((p) => p.id);
  const { count: totalModules } = await admin
    .from("lms_program_modules")
    .select("id", { count: "exact", head: true })
    .in("phase_id", phaseIds);

  // Kelulusan: milestone final program + status pencapaian ADV ini
  const [{ data: finalMilestones }, { data: advMilestones }] = await Promise.all([
    admin
      .from("lms_milestones")
      .select("id, name, emoji")
      .eq("program_id", enrollment.program_id)
      .eq("is_final", true)
      .order("order_index", { ascending: true }),
    admin
      .from("lms_adv_milestones")
      .select("id, milestone_id, status, certificate_url, approved_at")
      .eq("enrollment_id", enrollmentId),
  ]);
  const advMsMap = Object.fromEntries((advMilestones ?? []).map((a) => [a.milestone_id, a]));

  const summary = summarizeEnrollment(progressRows ?? [], totalModules ?? (progressRows ?? []).length);
  const sortedModules = sortByCurriculum((progressRows ?? []).filter((p) => moduleOf(p)));

  // Best passing score + attempt count per module
  const scoreMap: Record<string, number> = {};
  const attemptCountMap: Record<string, number> = {};
  for (const att of attempts ?? []) {
    const pt = nested<any>((att as any).lms_post_tests);
    const mid = pt?.module_id;
    if (!mid) continue;
    attemptCountMap[mid] = (attemptCountMap[mid] ?? 0) + 1;
    if (att.passed && (!(mid in scoreMap) || (att.score ?? 0) > scoreMap[mid])) {
      scoreMap[mid] = att.score ?? 0;
    }
  }

  // Submissions grouped by module
  const subsByModule: Record<string, any[]> = {};
  for (const sub of submissions ?? []) {
    const task = nested<any>((sub as any).lms_module_tasks);
    const mid = task?.module_id;
    if (!mid) continue;
    (subsByModule[mid] ??= []).push({ ...sub, taskTitle: task?.title });
  }

  const startDate = enrollment.approved_at ?? enrollment.enrolled_at;
  const elapsedDays = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / DAY_MS) + 1);

  return (
    <div className="space-y-6 pb-16">
      <FlashMessage message={msg} />
      {/* Header */}
      <div className="space-y-1">
        <Link
          href={`/lms/manager/programs/${enrollment.program_id}/progress`}
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> {program?.name ?? "Program"}
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {profile?.full_name ?? "—"}
          </h1>
          {enrollment.status === "completed" ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Selesai</span>
          ) : summary.isAtRisk ? (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" /> At-Risk
            </span>
          ) : (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">On-Track</span>
          )}
        </div>
        <p className="text-sm text-neutral-500">{profile?.email ?? "—"}</p>
      </div>

      {/* Overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-neutral-100 bg-white p-5">
          <p className="text-xs text-neutral-500">Progress</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{summary.pct}%</p>
          <p className="text-xs text-neutral-400">{summary.completedCount} / {summary.totalModules} modul</p>
        </div>
        <div className="rounded-3xl border border-neutral-100 bg-white p-5">
          <p className="text-xs text-neutral-500 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Lama Onboarding</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">Hari ke-{elapsedDays}</p>
          {summary.currentModuleTitle && (
            <p className="text-xs text-neutral-400 truncate">Sedang: {summary.currentModuleTitle}</p>
          )}
        </div>
        <div className={`rounded-3xl border p-5 ${summary.isAtRisk ? "border-red-100 bg-red-50" : "border-neutral-100 bg-white"}`}>
          <p className="text-xs text-neutral-500">Status Modul Aktif</p>
          {summary.isAtRisk && summary.daysOnCurrent != null ? (
            <>
              <p className="text-2xl font-bold text-red-600 mt-1">Telat</p>
              <p className="text-xs text-red-500">{summary.daysOnCurrent} hari · estimasi {summary.estimatedDays} hari</p>
            </>
          ) : summary.currentModuleTitle ? (
            <>
              <p className="text-2xl font-bold text-blue-600 mt-1">Sesuai</p>
              <p className="text-xs text-neutral-400">
                {summary.daysOnCurrent ?? 0} hari · estimasi {summary.estimatedDays ?? "—"} hari
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-green-600 mt-1">Tuntas</p>
          )}
        </div>
      </div>

      {/* Kelulusan & Sertifikat */}
      {(finalMilestones ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
            <Award className="h-5 w-5 text-yellow-500" /> Kelulusan & Sertifikat
          </h2>
          {(finalMilestones ?? []).map((m) => {
            const rec = advMsMap[m.id];
            const status = rec?.status as string | undefined;
            return (
              <div key={m.id} className="rounded-3xl border border-neutral-100 bg-white p-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-2xl">{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{m.name}</p>
                    <p className="text-xs text-neutral-400">
                      {!rec
                        ? "Belum tercapai — ADV belum menyelesaikan modul yang dibutuhkan."
                        : status === "pending_approval"
                        ? "Menunggu persetujuan Manager."
                        : status === "approved"
                        ? `Lulus${rec.approved_at ? " · " + new Date(rec.approved_at).toLocaleDateString("id-ID", { dateStyle: "medium" }) : ""}`
                        : status === "rejected"
                        ? "Pengajuan kelulusan ditolak."
                        : "Tercapai."}
                    </p>
                  </div>
                  {status === "approved" && (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Lulus</span>
                  )}
                  {status === "pending_approval" && (
                    <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">Menunggu</span>
                  )}
                  {status === "rejected" && (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Ditolak</span>
                  )}
                </div>

                {status === "pending_approval" && rec && (
                  <div className="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-4">
                    <form action={approveMilestone.bind(null, rec.id, `/lms/manager/adv/${enrollmentId}`)}>
                      <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
                        <CheckCircle2 className="h-4 w-4" /> Setujui & Terbitkan Sertifikat
                      </button>
                    </form>
                    <ConfirmButton
                      action={rejectMilestone.bind(null, rec.id, `/lms/manager/adv/${enrollmentId}`)}
                      className="flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                      title="Tolak pengajuan kelulusan?"
                      description="ADV tidak akan menerima sertifikat untuk milestone ini."
                      confirmLabel="Tolak"
                    >
                      <XCircle className="h-4 w-4" /> Tolak
                    </ConfirmButton>
                  </div>
                )}

                {status === "approved" && rec?.certificate_url && (
                  <div className="mt-4 border-t border-neutral-100 pt-4">
                    <a href={rec.certificate_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                      <Download className="h-4 w-4" /> Unduh Sertifikat (PDF)
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-modul detail */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Detail per Modul</h2>
        {sortedModules.length === 0 && (
          <p className="text-sm text-neutral-500">Belum ada data modul.</p>
        )}
        {sortedModules.map((p, idx) => {
          const mod = moduleOf(p);
          const score = scoreMap[p.module_id];
          const attemptsUsed = attemptCountMap[p.module_id] ?? 0;
          const subs = subsByModule[p.module_id] ?? [];
          return (
            <div key={p.module_id} className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100">
                <div className="flex items-center gap-3 min-w-0">
                  {p.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                  ) : p.status === "in_progress" ? (
                    <PlayCircle className="h-5 w-5 shrink-0 text-blue-500" />
                  ) : (
                    <Lock className="h-5 w-5 shrink-0 text-neutral-300" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      <span className="text-neutral-400">Modul {idx + 1}.</span> {mod?.title}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {p.status === "completed" ? "Selesai" : p.status === "in_progress" ? "Sedang dikerjakan" : "Terkunci"}
                    </p>
                  </div>
                </div>
                {score !== undefined ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    score >= 90 ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    Post-test {score}%
                  </span>
                ) : attemptsUsed > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    {attemptsUsed}x gagal
                  </span>
                ) : null}
              </div>

              {/* Riwayat submission */}
              {subs.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Riwayat Submission</p>
                  {subs.map((sub) => (
                    <div key={sub.id} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-neutral-700 truncate">{sub.taskTitle}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          sub.status === "approved" ? "bg-green-100 text-green-700" :
                          sub.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {sub.status === "approved" ? "Disetujui" : sub.status === "rejected" ? "Ditolak" : "Menunggu"}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {new Date(sub.submitted_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      {sub.notes && <p className="text-xs text-neutral-600">{sub.notes}</p>}
                      <div className="flex items-center gap-3">
                        {sub.screenshot_url && (
                          <a href={sub.screenshot_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ImageIcon className="h-3 w-3" /> Screenshot
                          </a>
                        )}
                        {sub.link_url && (
                          <a href={sub.link_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink className="h-3 w-3" /> Link
                          </a>
                        )}
                      </div>
                      {sub.feedback_comment && (
                        <div className="flex items-start gap-1.5 rounded-xl bg-white border border-neutral-100 px-2.5 py-1.5">
                          <FileText className="h-3 w-3 mt-0.5 shrink-0 text-neutral-400" />
                          <p className="text-xs text-neutral-600">{sub.feedback_comment}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
