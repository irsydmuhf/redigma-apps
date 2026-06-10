import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { submitTask, startPostTest, submitPostTest } from "./actions";
import {
  CheckCircle2, XCircle, Clock, FileText, Video, Paperclip,
  ChevronLeft, Upload, Link2, HelpCircle, AlertCircle, RotateCcw,
} from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; score?: string }>;
}

const STATUS_BADGE = {
  pending:  { label: "Menunggu Review", color: "bg-yellow-50 text-yellow-700",  icon: Clock },
  approved: { label: "Disetujui",       color: "bg-green-50 text-green-700",    icon: CheckCircle2 },
  rejected: { label: "Ditolak",         color: "bg-red-50 text-red-700",        icon: XCircle },
};

export default async function ModulePage({ params, searchParams }: Props) {
  const { id: moduleId } = await params;
  const { tab: tabParam, score: scoreParam } = await searchParams;
  const tab = tabParam ?? "materi";

  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: mod } = await admin
    .from("lms_program_modules")
    .select(`
      id, title, description, estimated_days, phase_id,
      lms_program_phases ( id, title, program_id ),
      lms_module_content ( id, type, content_text, video_url, file_url, file_name, order_index ),
      lms_module_tasks   ( id, title, description, requires_screenshot, requires_link, order_index )
    `)
    .eq("id", moduleId)
    .single();

  if (!mod) notFound();

  const phase = Array.isArray(mod.lms_program_phases) ? mod.lms_program_phases[0] : mod.lms_program_phases;
  const programId = phase?.program_id as string;

  // Day start calculation
  const { data: allPhases } = await admin
    .from("lms_program_phases")
    .select("id, order_index, lms_program_modules(id, order_index, estimated_days)")
    .eq("program_id", programId)
    .order("order_index", { ascending: true });

  let dayStart = 1;
  outer: for (const ph of (allPhases ?? []).sort((a, b) => a.order_index - b.order_index)) {
    for (const m of [...((ph.lms_program_modules as any[]) ?? [])].sort((a, b) => a.order_index - b.order_index)) {
      if (m.id === moduleId) break outer;
      dayStart += m.estimated_days ?? 1;
    }
  }

  // ADV: enrollment + progress + submissions
  let enrollmentId: string | null = null;
  let moduleStatus = "in_progress";
  let submissions: Record<string, any> = {};

  if (user.role === "adv") {
    const { data: enrollment } = await supabase
      .from("lms_program_enrollments")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("program_id", programId)
      .single();

    if (!enrollment || enrollment.status !== "active") redirect("/lms/dashboard");
    enrollmentId = enrollment.id;

    const { data: progress } = await supabase
      .from("lms_module_progress")
      .select("status")
      .eq("enrollment_id", enrollment.id)
      .eq("module_id", moduleId)
      .single();

    moduleStatus = progress?.status ?? "locked";
    if (moduleStatus === "locked") redirect(`/lms/program/${programId}`);

    const { data: subs } = await supabase
      .from("lms_task_submissions")
      .select("id, task_id, status, screenshot_url, link_url, notes, feedback_comment, submitted_at")
      .eq("enrollment_id", enrollment.id)
      .order("submitted_at", { ascending: false });

    for (const s of subs ?? []) {
      if (!submissions[s.task_id]) submissions[s.task_id] = s;
    }
  }

  const contents = [...(mod.lms_module_content ?? [])].sort((a, b) => a.order_index - b.order_index);
  const tasks = [...(mod.lms_module_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);

  const allTasksApproved = tasks.length === 0 || tasks.every((t) => submissions[t.id]?.status === "approved");

  // Post-test data
  const { data: postTest } = await admin
    .from("lms_post_tests")
    .select(`
      id, pass_score, max_attempts,
      lms_post_test_questions (
        id, question_text, order_index,
        lms_post_test_options (id, option_text, is_correct, order_index)
      )
    `)
    .eq("module_id", moduleId)
    .maybeSingle();

  // ADV post-test attempts
  let attempts: any[] = [];
  let activeAttempt: any = null;
  let activeAnswers: any[] = [];

  if (user.role === "adv" && enrollmentId && postTest) {
    const { data: attemptsData } = await supabase
      .from("lms_post_test_attempts")
      .select("id, attempt_number, started_at, submitted_at, score, passed")
      .eq("enrollment_id", enrollmentId)
      .eq("post_test_id", postTest.id)
      .order("attempt_number", { ascending: true });

    attempts = attemptsData ?? [];
    activeAttempt = attempts.find((a) => !a.submitted_at) ?? null;

    if (activeAttempt) {
      const { data: answersData } = await supabase
        .from("lms_post_test_attempt_answers")
        .select("id, question_id, question_text")
        .eq("attempt_id", activeAttempt.id);
      activeAnswers = answersData ?? [];
    }
  }

  const hasPassed = attempts.some((a) => a.passed);
  const attemptsUsed = attempts.filter((a) => a.submitted_at).length;
  const maxAttempts = postTest?.max_attempts ?? 3;
  const canStartNewAttempt = !hasPassed && !activeAttempt && attemptsUsed < maxAttempts;

  // Build options map: questionId → options[]
  const optionsMap: Record<string, any[]> = {};
  for (const q of (postTest as any)?.lms_post_test_questions ?? []) {
    optionsMap[q.id] = [...(q.lms_post_test_options ?? [])].sort((a: any, b: any) => a.order_index - b.order_index);
  }

  const questions = [...((postTest as any)?.lms_post_test_questions ?? [])].sort(
    (a: any, b: any) => a.order_index - b.order_index
  );

  function getEmbedUrl(url: string) {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    return url;
  }

  const tabClass = (t: string) =>
    t === tab
      ? "rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
      : "rounded-full px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900";

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      {/* Breadcrumb */}
      <Link href={`/lms/program/${programId}`} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700">
        <ChevronLeft className="h-4 w-4" /> Kembali ke Learning Path
      </Link>

      {/* Module header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
              Day {dayStart}
            </span>
            {moduleStatus === "in_progress" && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Sedang Dikerjakan
              </span>
            )}
            {moduleStatus === "completed" && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                Selesai
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <Clock className="h-3.5 w-3.5" /> {mod.estimated_days} hari
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{mod.title}</h1>
        {mod.description && <p className="text-sm text-neutral-600">{mod.description}</p>}
      </div>

      {/* Tabs (ADV only) */}
      {user.role === "adv" && (
        <div className="flex items-center gap-1 rounded-full border border-neutral-100 bg-neutral-50 p-1">
          <Link href={`?tab=materi`} className={tabClass("materi")}>Materi</Link>
          <Link href={`?tab=tasks`} className={tabClass("tasks")}>Task &amp; Bukti</Link>
          <Link
            href={postTest ? `?tab=posttest` : "#"}
            className={`${tabClass("posttest")} ${!postTest ? "opacity-40 pointer-events-none" : ""}`}
          >
            Post-Test
          </Link>
        </div>
      )}

      {/* ── TAB: MATERI ── */}
      {(tab === "materi" || user.role !== "adv") && (
        <div className="space-y-4">
          {user.role !== "adv" && contents.length === 0 && tasks.length === 0 && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center text-sm text-neutral-500">
              Belum ada konten atau task di modul ini.
            </div>
          )}
          {contents.map((c) => (
            <div key={c.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-3">
              {c.type === "text" && (
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{c.content_text}</p>
                </div>
              )}
              {c.type === "video" && c.video_url && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                    <Video className="h-4 w-4 text-red-500" /> Video
                  </div>
                  <div className="aspect-video w-full overflow-hidden rounded-2xl bg-neutral-100">
                    <iframe src={getEmbedUrl(c.video_url)} className="h-full w-full" allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                  </div>
                </div>
              )}
              {c.type === "file" && c.file_url && (
                <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 hover:bg-neutral-50">
                  <Paperclip className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-neutral-700">{c.file_name ?? "Download File"}</span>
                </a>
              )}
            </div>
          ))}
          {contents.length === 0 && user.role === "adv" && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center text-sm text-neutral-500">
              Belum ada materi di modul ini.
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TASK & BUKTI ── */}
      {tab === "tasks" && user.role === "adv" && (
        <div className="space-y-4">
          {/* Info banner */}
          {!allTasksApproved && postTest && (
            <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <p className="text-sm text-blue-700">
                Selesaikan semua task dan tunggu approval Manager untuk bisa mengerjakan post-test.
              </p>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center text-sm text-neutral-500">
              Tidak ada task di modul ini.
            </div>
          )}

          {tasks.map((task, idx) => {
            const sub = submissions[task.id] ?? null;
            const cfg = sub ? STATUS_BADGE[sub.status as keyof typeof STATUS_BADGE] : null;
            const StatusIcon = cfg?.icon;
            const canSubmit = moduleStatus !== "completed" && (!sub || sub.status === "rejected");

            return (
              <div key={task.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-400">Task {idx + 1}</p>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-neutral-900">{task.title}</p>
                      {task.description && <p className="text-sm text-neutral-600">{task.description}</p>}
                    </div>
                    {cfg && StatusIcon && (
                      <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}>
                        <StatusIcon className="h-3.5 w-3.5" /> {cfg.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Approved state */}
                {sub?.status === "approved" && (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-semibold text-green-800">Disetujui Manager</p>
                    </div>
                    {sub.feedback_comment && (
                      <p className="text-xs text-green-700 pl-6">{sub.feedback_comment}</p>
                    )}
                  </div>
                )}

                {/* Pending state */}
                {sub?.status === "pending" && (
                  <div className="rounded-2xl bg-neutral-50 p-4 space-y-2 text-xs text-neutral-600">
                    {sub.screenshot_url && (
                      <a href={sub.screenshot_url} target="_blank" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                        <Upload className="h-3.5 w-3.5" /> Lihat screenshot
                      </a>
                    )}
                    {sub.link_url && (
                      <a href={sub.link_url} target="_blank" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                        <Link2 className="h-3.5 w-3.5" /> {sub.link_url}
                      </a>
                    )}
                    {sub.notes && <p className="text-neutral-500 italic">"{sub.notes}"</p>}
                  </div>
                )}

                {/* Rejected feedback */}
                {sub?.status === "rejected" && sub.feedback_comment && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 space-y-1">
                    <p className="text-xs font-semibold text-red-700">Feedback Manager:</p>
                    <p className="text-sm text-red-700">{sub.feedback_comment}</p>
                  </div>
                )}

                {/* Submit form */}
                {canSubmit && enrollmentId && (
                  <form
                    action={submitTask.bind(null, task.id, enrollmentId, moduleId)}
                    className="space-y-4 border-t border-neutral-100 pt-4"
                  >
                    {sub?.status === "rejected" && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
                        <RotateCcw className="h-3.5 w-3.5" /> Submit ulang di bawah:
                      </p>
                    )}

                    {task.requires_screenshot && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-neutral-700">
                          Upload Screenshot <span className="text-red-500">*</span>
                        </p>
                        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-8 hover:border-neutral-400 transition-colors">
                          <Upload className="h-6 w-6 text-neutral-400" />
                          <span className="text-sm text-neutral-500">Klik atau drag &amp; drop screenshot</span>
                          <span className="text-xs text-neutral-400">PNG, JPG maks. 5MB</span>
                          <input type="file" name="screenshot" accept="image/*" required className="hidden" />
                        </label>
                      </div>
                    )}

                    {task.requires_link && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-700">
                          Link <span className="text-red-500">*</span>
                        </label>
                        <input type="url" name="link_url" required placeholder="https://..."
                          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-400" />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-neutral-700">Catatan (opsional)</label>
                      <textarea name="notes" rows={3} placeholder="Tambahkan catatan untuk Manager…"
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-400 resize-none" />
                    </div>

                    <button type="submit"
                      className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
                      Submit Bukti
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: POST-TEST ── */}
      {tab === "posttest" && user.role === "adv" && postTest && (
        <div className="space-y-4">
          {/* Score result after submit */}
          {scoreParam && (
            <div className={`rounded-3xl border p-5 space-y-1 ${Number(scoreParam) >= postTest.pass_score ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
              {Number(scoreParam) >= postTest.pass_score ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="font-semibold text-green-800">Selamat, kamu lulus!</p>
                  </div>
                  <p className="text-sm text-green-700 pl-7">Skor: {scoreParam}% (min. {postTest.pass_score}%)</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <p className="font-semibold text-red-800">Belum lulus</p>
                  </div>
                  <p className="text-sm text-red-700 pl-7">
                    Skor: {scoreParam}% (min. {postTest.pass_score}%). {attemptsUsed < maxAttempts ? `Sisa ${maxAttempts - attemptsUsed} percobaan.` : "Batas percobaan habis."}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Locked: tasks not done */}
          {!allTasksApproved && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center space-y-3">
              <HelpCircle className="mx-auto h-10 w-10 text-neutral-300" />
              <p className="text-sm font-medium text-neutral-700">Post-Test Terkunci</p>
              <p className="text-xs text-neutral-500">
                Selesaikan semua task dan tunggu approval Manager terlebih dahulu.
              </p>
            </div>
          )}

          {/* Passed */}
          {allTasksApproved && hasPassed && (
            <div className="rounded-3xl border border-green-100 bg-green-50 p-6 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
              <p className="text-sm font-semibold text-green-800">
                Lulus! Skor: {attempts.find((a) => a.passed)?.score}%
              </p>
            </div>
          )}

          {/* Active attempt: quiz form */}
          {allTasksApproved && !hasPassed && activeAttempt && enrollmentId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-700">
                  Percobaan {activeAttempt.attempt_number} dari {maxAttempts}
                </p>
                <p className="text-xs text-neutral-500">{questions.length} soal · Min. {postTest.pass_score}% lulus</p>
              </div>

              <form action={submitPostTest.bind(null, activeAttempt.id, enrollmentId, moduleId)} className="space-y-4">
                {activeAnswers.map((answer, idx) => {
                  const opts = optionsMap[answer.question_id] ?? [];
                  return (
                    <div key={answer.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
                      <p className="text-sm font-semibold text-neutral-900">
                        <span className="text-neutral-400 font-normal">{idx + 1}. </span>
                        {answer.question_text}
                      </p>
                      <div className="space-y-2">
                        {opts.map((opt: any) => (
                          <label key={opt.id}
                            className="flex items-center gap-3 cursor-pointer rounded-2xl border border-neutral-100 px-4 py-3 hover:border-neutral-300 hover:bg-neutral-50 transition-colors">
                            <input type="radio" name={`answer_${answer.id}`} value={opt.id}
                              className="accent-neutral-900" />
                            <span className="text-sm text-neutral-700">{opt.option_text}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button type="submit"
                  className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
                  Submit Jawaban
                </button>
              </form>
            </div>
          )}

          {/* Can start new attempt */}
          {allTasksApproved && !hasPassed && canStartNewAttempt && enrollmentId && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-8 space-y-4">
              <div className="text-center space-y-2">
                <HelpCircle className="mx-auto h-10 w-10 text-neutral-300" />
                <p className="text-sm font-semibold text-neutral-900">
                  {attemptsUsed === 0 ? "Kamu siap mengerjakan post-test?" : "Coba lagi?"}
                </p>
                <p className="text-xs text-neutral-500">
                  {questions.length} soal · Min. {postTest.pass_score}% lulus · {maxAttempts - attemptsUsed} percobaan tersisa
                </p>
              </div>
              <form action={startPostTest.bind(null, postTest.id, enrollmentId, moduleId)}>
                <button type="submit"
                  className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
                  {attemptsUsed === 0 ? "Mulai Post-Test" : "Mulai Percobaan Baru"}
                </button>
              </form>
            </div>
          )}

          {/* No attempts left */}
          {allTasksApproved && !hasPassed && !canStartNewAttempt && !activeAttempt && (
            <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center space-y-2">
              <XCircle className="mx-auto h-10 w-10 text-neutral-300" />
              <p className="text-sm font-semibold text-neutral-700">Batas percobaan habis</p>
              <p className="text-xs text-neutral-500">
                Hubungi Manager untuk reset percobaan post-test.
              </p>
            </div>
          )}

          {/* Attempt history */}
          {attempts.filter((a) => a.submitted_at).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Riwayat Percobaan</p>
              {attempts.filter((a) => a.submitted_at).map((a) => (
                <div key={a.id}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${a.passed ? "border-green-100 bg-green-50" : "border-neutral-100 bg-white"}`}>
                  <span className="text-sm text-neutral-700">Percobaan {a.attempt_number}</span>
                  <span className={`text-sm font-semibold ${a.passed ? "text-green-700" : "text-red-600"}`}>
                    {a.score}% {a.passed ? "✓ Lulus" : "✗ Tidak Lulus"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
