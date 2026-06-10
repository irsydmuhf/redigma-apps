import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { submitTask } from "./actions";
import {
  CheckCircle2, XCircle, Clock, FileText,
  Video, Paperclip, ChevronLeft, Upload, Link2,
} from "lucide-react";

interface Props { params: Promise<{ id: string }> }

const STATUS_BADGE = {
  pending:  { label: "Menunggu Review", color: "bg-yellow-50 text-yellow-700", icon: Clock },
  approved: { label: "Disetujui",       color: "bg-green-50 text-green-700",  icon: CheckCircle2 },
  rejected: { label: "Ditolak",         color: "bg-red-50 text-red-700",      icon: XCircle },
};

export default async function ModulePage({ params }: Props) {
  const { id: moduleId } = await params;
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: mod } = await admin
    .from("lms_program_modules")
    .select(`
      id, title, description, estimated_days,
      phase_id,
      lms_program_phases ( id, title, program_id ),
      lms_module_content ( id, type, content_text, video_url, file_url, file_name, order_index ),
      lms_module_tasks   ( id, title, description, requires_screenshot, requires_link, order_index )
    `)
    .eq("id", moduleId)
    .single();

  if (!mod) notFound();

  const phase = Array.isArray(mod.lms_program_phases)
    ? mod.lms_program_phases[0]
    : mod.lms_program_phases;

  const programId = phase?.program_id as string;

  // Untuk ADV: cek enrollment aktif & progress modul
  let enrollmentId: string | null = null;
  let moduleStatus = "in_progress";
  let submissions: Record<string, { id: string; status: string; screenshot_url: string | null; link_url: string | null; notes: string | null; feedback_comment: string | null }> = {};

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

    // Ambil submission terbaru per task
    const { data: subs } = await supabase
      .from("lms_task_submissions")
      .select("id, task_id, status, screenshot_url, link_url, notes, feedback_comment, submitted_at")
      .eq("enrollment_id", enrollment.id)
      .order("submitted_at", { ascending: false });

    // Ambil submission terbaru per task_id
    for (const s of subs ?? []) {
      if (!submissions[s.task_id]) {
        submissions[s.task_id] = s;
      }
    }
  }

  const contents = [...(mod.lms_module_content ?? [])].sort((a, b) => a.order_index - b.order_index);
  const tasks = [...(mod.lms_module_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);

  function getEmbedUrl(url: string) {
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Lainnya dikembalikan apa adanya
    return url;
  }

  return (
    <div className="max-w-3xl space-y-8 pb-16">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href={`/lms/program/${programId}`} className="flex items-center gap-1 hover:text-neutral-700">
          <ChevronLeft className="h-4 w-4" /> {phase?.title ?? "Program"}
        </Link>
        <span>/</span>
        <span className="text-neutral-900 font-medium">{mod.title}</span>
      </div>

      {/* Module header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{mod.title}</h1>
        {mod.description && <p className="text-sm text-neutral-600">{mod.description}</p>}
        {moduleStatus === "completed" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Modul Selesai
          </span>
        )}
      </div>

      {/* Content */}
      {contents.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Materi</h2>
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
                    <iframe
                      src={getEmbedUrl(c.video_url)}
                      className="h-full w-full"
                      allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                  </div>
                </div>
              )}
              {c.type === "file" && c.file_url && (
                <a
                  href={c.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 hover:bg-neutral-50"
                >
                  <Paperclip className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-neutral-700">{c.file_name ?? "Download File"}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Task</h2>
          {tasks.map((task) => {
            const sub = submissions[task.id] ?? null;
            const cfg = sub ? STATUS_BADGE[sub.status as keyof typeof STATUS_BADGE] : null;
            const StatusIcon = cfg?.icon;
            const canSubmit = user.role === "adv" && moduleStatus !== "completed" && (!sub || sub.status === "rejected");

            return (
              <div key={task.id} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-neutral-900">{task.title}</p>
                    {task.description && (
                      <p className="text-sm text-neutral-600">{task.description}</p>
                    )}
                    <div className="flex gap-3 pt-1">
                      {task.requires_screenshot && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Upload className="h-3.5 w-3.5" /> Wajib screenshot
                        </span>
                      )}
                      {task.requires_link && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Link2 className="h-3.5 w-3.5" /> Wajib link
                        </span>
                      )}
                    </div>
                  </div>
                  {cfg && StatusIcon && (
                    <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                  )}
                </div>

                {/* Feedback dari manager */}
                {sub?.status === "rejected" && sub.feedback_comment && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <p className="text-xs font-semibold text-red-700 mb-1">Feedback Manager:</p>
                    <p className="text-sm text-red-700">{sub.feedback_comment}</p>
                  </div>
                )}

                {/* Screenshot & link yang sudah disubmit */}
                {sub && sub.status !== "rejected" && (
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

                {/* Form submit task */}
                {canSubmit && enrollmentId && (
                  <form
                    action={submitTask.bind(null, task.id, enrollmentId, moduleId)}
                    className="space-y-3 border-t border-neutral-100 pt-4"
                    encType="multipart/form-data"
                  >
                    {sub?.status === "rejected" && (
                      <p className="text-xs font-medium text-orange-600">Submit ulang di bawah:</p>
                    )}
                    {task.requires_screenshot && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-neutral-700">
                          Screenshot <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="file"
                          name="screenshot"
                          accept="image/*"
                          required={task.requires_screenshot}
                          className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-neutral-200"
                        />
                      </div>
                    )}
                    {task.requires_link && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-neutral-700">
                          Link <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          name="link_url"
                          required={task.requires_link}
                          placeholder="https://..."
                          className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-neutral-700">Catatan (opsional)</label>
                      <textarea
                        name="notes"
                        rows={2}
                        placeholder="Tambahkan catatan untuk Manager…"
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400 resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
                    >
                      Submit Task
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tasks.length === 0 && contents.length === 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center text-sm text-neutral-500">
          Belum ada konten atau task di modul ini.
        </div>
      )}
    </div>
  );
}
