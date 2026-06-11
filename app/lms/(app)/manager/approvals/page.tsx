import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { approveEnrollment, rejectEnrollment, approveMilestone, rejectMilestone } from "./actions";
import { approveSubmission, rejectSubmission } from "@/app/lms/(app)/module/[id]/actions";
import { CheckCircle2, XCircle, Clock, Upload, Link2, Award } from "lucide-react";
import { FlashMessage } from "@/components/lms/ui/flash-message";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function LmsApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const admin = createAdminClient();

  // ── Enrollments pending ───────────────────────────────────
  const { data: rawEnrollments } = await admin
    .from("lms_program_enrollments")
    .select("id, user_id, program_id, enrolled_at")
    .eq("status", "pending")
    .order("enrolled_at", { ascending: true });

  const enrollments = rawEnrollments ?? [];

  // Ambil profiles & programs secara terpisah
  const enrollmentUserIds = [...new Set(enrollments.map((e) => e.user_id))];
  const enrollmentProgIds = [...new Set(enrollments.map((e) => e.program_id))];

  const [{ data: advProfiles }, { data: enrollPrograms }] = await Promise.all([
    enrollmentUserIds.length
      ? admin.from("lms_user_profiles").select("id, full_name, email").in("id", enrollmentUserIds)
      : Promise.resolve({ data: [] }),
    enrollmentProgIds.length
      ? admin.from("lms_programs").select("id, name").in("id", enrollmentProgIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = Object.fromEntries((advProfiles ?? []).map((p) => [p.id, p]));
  const progMap = Object.fromEntries((enrollPrograms ?? []).map((p) => [p.id, p]));

  // ── Task submissions pending ──────────────────────────────
  const { data: rawSubmissions } = await admin
    .from("lms_task_submissions")
    .select("id, enrollment_id, task_id, submitted_at, screenshot_url, link_url, notes")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  const submissions = rawSubmissions ?? [];

  const submissionTaskIds = [...new Set(submissions.map((s) => s.task_id))];
  const submissionEnrollIds = [...new Set(submissions.map((s) => s.enrollment_id))];

  const [{ data: tasks }, { data: subEnrollments }] = await Promise.all([
    submissionTaskIds.length
      ? admin
          .from("lms_module_tasks")
          .select("id, title, module_id, lms_program_modules(id, title, lms_program_phases(title, lms_programs(name)))")
          .in("id", submissionTaskIds)
      : Promise.resolve({ data: [] }),
    submissionEnrollIds.length
      ? admin.from("lms_program_enrollments").select("id, user_id").in("id", submissionEnrollIds)
      : Promise.resolve({ data: [] }),
  ]);

  const subEnrollUserIds = [...new Set((subEnrollments ?? []).map((e) => e.user_id))];
  const { data: subProfiles } = subEnrollUserIds.length
    ? await admin.from("lms_user_profiles").select("id, full_name, email").in("id", subEnrollUserIds)
    : { data: [] };

  const taskMap = Object.fromEntries((tasks ?? []).map((t) => [t.id, t]));
  const subEnrollMap = Object.fromEntries((subEnrollments ?? []).map((e) => [e.id, e]));
  const subProfileMap = Object.fromEntries((subProfiles ?? []).map((p) => [p.id, p]));

  // ── Kelulusan (final milestone) pending ───────────────────
  const { data: rawFinals } = await admin
    .from("lms_adv_milestones")
    .select("id, enrollment_id, milestone_id, achieved_at")
    .eq("status", "pending_approval")
    .order("achieved_at", { ascending: true });

  const finals = rawFinals ?? [];
  const finalMsIds = [...new Set(finals.map((f) => f.milestone_id))];
  const finalEnrollIds = [...new Set(finals.map((f) => f.enrollment_id))];

  const [{ data: finalMs }, { data: finalEnrolls }] = await Promise.all([
    finalMsIds.length
      ? admin.from("lms_milestones").select("id, name, emoji").in("id", finalMsIds)
      : Promise.resolve({ data: [] }),
    finalEnrollIds.length
      ? admin.from("lms_program_enrollments").select("id, user_id, program_id").in("id", finalEnrollIds)
      : Promise.resolve({ data: [] }),
  ]);

  const finalUserIds = [...new Set((finalEnrolls ?? []).map((e) => e.user_id))];
  const finalProgIds = [...new Set((finalEnrolls ?? []).map((e) => e.program_id))];

  const [{ data: finalProfiles }, { data: finalPrograms }] = await Promise.all([
    finalUserIds.length
      ? admin.from("lms_user_profiles").select("id, full_name, email").in("id", finalUserIds)
      : Promise.resolve({ data: [] }),
    finalProgIds.length
      ? admin.from("lms_programs").select("id, name").in("id", finalProgIds)
      : Promise.resolve({ data: [] }),
  ]);

  const finalMsMap = Object.fromEntries((finalMs ?? []).map((m) => [m.id, m]));
  const finalEnrollMap = Object.fromEntries((finalEnrolls ?? []).map((e) => [e.id, e]));
  const finalProfileMap = Object.fromEntries((finalProfiles ?? []).map((p) => [p.id, p]));
  const finalProgMap = Object.fromEntries((finalPrograms ?? []).map((p) => [p.id, p]));

  const totalPending = enrollments.length + submissions.length + finals.length;

  return (
    <div className="space-y-8">
      <FlashMessage message={msg} />
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Persetujuan</h1>
        <p className="text-sm text-neutral-600">
          {totalPending === 0
            ? "Tidak ada yang menunggu."
            : `${totalPending} item menunggu persetujuan.`}
        </p>
      </div>

      {/* Kelulusan (final milestone) approvals */}
      {finals.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            <Award className="h-4 w-4 text-yellow-500" /> Kelulusan ({finals.length})
          </h2>
          <div className="space-y-3">
            {finals.map((f) => {
              const enr = finalEnrollMap[f.enrollment_id];
              const adv = enr ? finalProfileMap[enr.user_id] : null;
              const prog = enr ? finalProgMap[enr.program_id] : null;
              const ms = finalMsMap[f.milestone_id];
              const date = new Date(f.achieved_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "short", year: "numeric",
              });
              return (
                <div key={f.id} className="rounded-3xl border border-yellow-100 bg-yellow-50/40 p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{ms?.emoji ?? "🎓"}</span>
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-neutral-900">{ms?.name ?? "Kelulusan"}</p>
                      <p className="text-xs text-neutral-500">
                        ADV: <span className="font-medium text-neutral-700">{adv?.full_name ?? "—"}</span>
                        {" · "}{prog?.name ?? "—"}{" · tercapai "}{date}
                      </p>
                      <p className="text-xs text-neutral-400">
                        Menyetujui akan menerbitkan sertifikat & menandai ADV lulus.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-t border-yellow-100 pt-4">
                    <form action={approveMilestone.bind(null, f.id, "/lms/manager/approvals")}>
                      <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
                        <CheckCircle2 className="h-4 w-4" /> Setujui & Terbitkan Sertifikat
                      </button>
                    </form>
                    <ConfirmButton
                      action={rejectMilestone.bind(null, f.id, "/lms/manager/approvals")}
                      className="flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                      title="Tolak pengajuan kelulusan?"
                      description="ADV tidak akan menerima sertifikat untuk milestone ini."
                      confirmLabel="Tolak"
                    >
                      <XCircle className="h-4 w-4" /> Tolak
                    </ConfirmButton>
                    {enr && (
                      <Link href={`/lms/manager/adv/${f.enrollment_id}`} className="ml-auto text-xs text-neutral-500 hover:text-neutral-700 hover:underline">
                        Lihat detail ADV
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Enrollment approvals */}
      {enrollments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Pendaftaran ADV ({enrollments.length})
          </h2>
          <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left">
                  <th className="px-6 py-4 font-semibold text-neutral-700">ADV</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Program</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Daftar</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {enrollments.map((e) => {
                  const adv = profileMap[e.user_id];
                  const prog = progMap[e.program_id];
                  const date = new Date(e.enrolled_at).toLocaleDateString("id-ID", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  return (
                    <tr key={e.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-neutral-900">{adv?.full_name ?? "—"}</p>
                        <p className="text-xs text-neutral-500">{adv?.email}</p>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">{prog?.name ?? "—"}</td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <Clock className="h-3.5 w-3.5" />{date}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <form action={approveEnrollment.bind(null, e.id)}>
                            <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Setujui
                            </button>
                          </form>
                          <form action={rejectEnrollment.bind(null, e.id)}>
                            <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                              <XCircle className="h-3.5 w-3.5" /> Tolak
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task submission approvals */}
      {submissions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Submission Task ({submissions.length})
          </h2>
          <div className="space-y-3">
            {submissions.map((s) => {
              const task = taskMap[s.task_id];
              const mod = Array.isArray(task?.lms_program_modules)
                ? task?.lms_program_modules[0]
                : task?.lms_program_modules;
              const phase = Array.isArray(mod?.lms_program_phases)
                ? mod?.lms_program_phases[0]
                : mod?.lms_program_phases;
              const prog = Array.isArray(phase?.lms_programs)
                ? phase?.lms_programs[0]
                : phase?.lms_programs;
              const enrollUser = subEnrollMap[s.enrollment_id];
              const adv = enrollUser ? subProfileMap[enrollUser.user_id] : null;
              const moduleId = task?.module_id as string ?? "";
              const date = new Date(s.submitted_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "short", year: "numeric",
              });

              return (
                <div key={s.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-neutral-900">{task?.title ?? "Task"}</p>
                    <p className="text-xs text-neutral-500">
                      {prog?.name} · {phase?.title} · {mod?.title}
                    </p>
                    <p className="text-xs text-neutral-500">
                      ADV: <span className="font-medium text-neutral-700">{adv?.full_name ?? "—"}</span>
                      {" · "}{adv?.email}{" · "}{date}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {s.screenshot_url && (
                      <a href={s.screenshot_url} target="_blank" className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                        <Upload className="h-3.5 w-3.5" /> Lihat Screenshot
                      </a>
                    )}
                    {s.link_url && (
                      <a href={s.link_url} target="_blank" className="flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 max-w-xs truncate">
                        <Link2 className="h-3.5 w-3.5 shrink-0" /> {s.link_url}
                      </a>
                    )}
                    {s.notes && <p className="w-full text-xs text-neutral-500 italic">"{s.notes}"</p>}
                  </div>

                  <div className="flex items-center gap-3 border-t border-neutral-100 pt-4">
                    <form action={approveSubmission.bind(null, s.id, moduleId)}>
                      <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
                        <CheckCircle2 className="h-4 w-4" /> Setujui
                      </button>
                    </form>
                    <form action={rejectSubmission.bind(null, s.id)} className="flex-1 flex items-center gap-2">
                      <input
                        name="feedback_comment"
                        required
                        placeholder="Alasan penolakan (wajib)…"
                        className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-red-300"
                      />
                      <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 shrink-0">
                        <XCircle className="h-4 w-4" /> Tolak
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalPending === 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <p className="text-sm font-medium text-neutral-700">Semua sudah diproses!</p>
        </div>
      )}
    </div>
  );
}
