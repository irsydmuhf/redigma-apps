import { createAdminClient } from "@/lib/supabase/admin";
import { approveEnrollment, rejectEnrollment } from "./actions";
import { approveSubmission, rejectSubmission } from "@/app/lms/(app)/module/[id]/actions";
import { CheckCircle2, XCircle, Clock, Upload, Link2 } from "lucide-react";

export default async function LmsApprovalsPage() {
  const admin = createAdminClient();

  const [{ data: pendingEnrollments }, { data: pendingSubmissions }] = await Promise.all([
    admin
      .from("lms_program_enrollments")
      .select("id, enrolled_at, lms_user_profiles(full_name, email), lms_programs(name)")
      .eq("status", "pending")
      .order("enrolled_at", { ascending: true }),

    admin
      .from("lms_task_submissions")
      .select(`
        id, submitted_at, screenshot_url, link_url, notes,
        lms_module_tasks ( id, title, module_id,
          lms_program_modules ( id, title,
            lms_program_phases ( title, lms_programs ( name ) )
          )
        ),
        lms_program_enrollments ( lms_user_profiles ( full_name, email ) )
      `)
      .eq("status", "pending")
      .order("submitted_at", { ascending: true }),
  ]);

  const enrollments = pendingEnrollments ?? [];
  const submissions = pendingSubmissions ?? [];
  const totalPending = enrollments.length + submissions.length;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Persetujuan</h1>
        <p className="text-sm text-neutral-600">
          {totalPending === 0 ? "Tidak ada yang menunggu." : `${totalPending} item menunggu persetujuan.`}
        </p>
      </div>

      {/* Enrollment approvals */}
      {enrollments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">Pendaftaran ADV ({enrollments.length})</h2>
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
                  const adv = Array.isArray(e.lms_user_profiles) ? e.lms_user_profiles[0] : e.lms_user_profiles;
                  const prog = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
                  const date = new Date(e.enrolled_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <tr key={e.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-neutral-900">{adv?.full_name ?? "—"}</p>
                        <p className="text-xs text-neutral-500">{adv?.email}</p>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">{prog?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-xs text-neutral-500 flex items-center gap-1.5 mt-3">
                        <Clock className="h-3.5 w-3.5" />{date}
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
          <h2 className="text-sm font-semibold text-neutral-700">Submission Task ({submissions.length})</h2>
          <div className="space-y-3">
            {submissions.map((s) => {
              const task = Array.isArray(s.lms_module_tasks) ? s.lms_module_tasks[0] : s.lms_module_tasks;
              const mod = Array.isArray(task?.lms_program_modules) ? task?.lms_program_modules[0] : task?.lms_program_modules;
              const phase = Array.isArray(mod?.lms_program_phases) ? mod?.lms_program_phases[0] : mod?.lms_program_phases;
              const prog = Array.isArray(phase?.lms_programs) ? phase?.lms_programs[0] : phase?.lms_programs;
              const enrollment = Array.isArray(s.lms_program_enrollments) ? s.lms_program_enrollments[0] : s.lms_program_enrollments;
              const adv = Array.isArray(enrollment?.lms_user_profiles) ? enrollment?.lms_user_profiles[0] : enrollment?.lms_user_profiles;
              const date = new Date(s.submitted_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              const moduleId = task?.module_id as string ?? "";

              return (
                <div key={s.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
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
                  </div>

                  {/* Evidence */}
                  <div className="flex flex-wrap gap-3">
                    {s.screenshot_url && (
                      <a href={s.screenshot_url} target="_blank" className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                        <Upload className="h-3.5 w-3.5" /> Lihat Screenshot
                      </a>
                    )}
                    {s.link_url && (
                      <a href={s.link_url} target="_blank" className="flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 truncate max-w-xs">
                        <Link2 className="h-3.5 w-3.5 shrink-0" /> {s.link_url}
                      </a>
                    )}
                    {s.notes && (
                      <p className="w-full text-xs text-neutral-500 italic">"{s.notes}"</p>
                    )}
                  </div>

                  {/* Actions */}
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
