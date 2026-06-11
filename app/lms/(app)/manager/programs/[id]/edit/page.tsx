import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  addPhase, deletePhase,
  addModule, deleteModule,
  addContent, deleteContent,
  addTask, deleteTask,
  updateProgram, duplicateProgram,
  createPostTest, deletePostTest,
  addQuestion, deleteQuestion,
  addOption, deleteOption, setCorrectOption,
  createMilestone, deleteMilestone,
} from "@/lib/lms/program-actions";
import { Copy, Trash2, Plus, BookOpen, FileText, Video, Paperclip, CheckSquare, HelpCircle, Check, ChevronLeft, Trophy } from "lucide-react";
import { FlashMessage } from "@/components/lms/ui/flash-message";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}

export default async function EditProgramPage({ params, searchParams }: Props) {
  const { id: programId } = await params;
  const { msg } = await searchParams;
  const admin = createAdminClient();

  const { data: program } = await admin
    .from("lms_programs")
    .select(`
      id, name, description, platform, is_archived,
      lms_program_phases (
        id, title, order_index, duration_days,
        lms_program_modules (
          id, title, description, order_index, estimated_days,
          lms_module_content (id, type, content_text, video_url, file_url, file_name, order_index),
          lms_module_tasks (id, title, description, requires_screenshot, requires_link, order_index),
          lms_post_tests (
            id, pass_score, max_attempts,
            lms_post_test_questions (
              id, question_text, order_index,
              lms_post_test_options (id, option_text, is_correct, order_index)
            )
          )
        )
      )
    `)
    .eq("id", programId)
    .single();

  if (!program) notFound();

  const { data: milestonesData } = await admin
    .from("lms_milestones")
    .select("id, name, description, required_modules_completed, emoji, order_index, is_final")
    .eq("program_id", programId)
    .order("required_modules_completed", { ascending: true });

  const phases = [...(program.lms_program_phases ?? [])].sort((a, b) => a.order_index - b.order_index);
  const milestones = milestonesData ?? [];

  return (
    <div className="space-y-8 pb-16">
      <FlashMessage message={msg} />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/lms/manager/programs" className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700">
            <ChevronLeft className="h-4 w-4" /> Program
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{program.name}</h1>
        </div>
        <form action={duplicateProgram.bind(null, programId)}>
          <button type="submit" className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            <Copy className="h-4 w-4" /> Duplikasi
          </button>
        </form>
      </div>

      {/* Program Info */}
      <form action={updateProgram.bind(null, programId)} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Informasi Program</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600">Nama Program</label>
            <input name="name" defaultValue={program.name} required
              className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600">Platform</label>
            <select name="platform" defaultValue={program.platform}
              className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400 bg-white">
              <option value="other">Lainnya</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="shopee">Shopee</option>
              <option value="tokopedia">Tokopedia</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-600">Deskripsi</label>
          <textarea name="description" defaultValue={program.description ?? ""} rows={2}
            className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400 resize-none" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
            Simpan
          </button>
        </div>
      </form>

      {/* Phases */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900">Kurikulum</h2>

        {phases.length === 0 && (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
            Belum ada phase. Tambahkan phase pertama di bawah.
          </div>
        )}

        {phases.map((phase) => {
          const modules = [...(phase.lms_program_modules ?? [])].sort((a, b) => a.order_index - b.order_index);
          return (
            <div key={phase.id} className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
              {/* Phase header */}
              <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4 bg-neutral-50">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-neutral-400" />
                  <span className="font-semibold text-neutral-900">{phase.title}</span>
                  {phase.duration_days && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                      {phase.duration_days} hari
                    </span>
                  )}
                </div>
                <form action={deletePhase.bind(null, phase.id, programId)}>
                  <button type="submit" className="rounded-xl p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>

              <div className="p-6 space-y-6">
                {/* Modules */}
                {modules.map((mod) => {
                  const contents = [...(mod.lms_module_content ?? [])].sort((a, b) => a.order_index - b.order_index);
                  const tasks = [...(mod.lms_module_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);
                  const postTest = Array.isArray(mod.lms_post_tests)
                    ? mod.lms_post_tests[0]
                    : mod.lms_post_tests ?? null;
                  const questions = [...((postTest as any)?.lms_post_test_questions ?? [])].sort(
                    (a: any, b: any) => a.order_index - b.order_index
                  );

                  return (
                    <div key={mod.id} className="rounded-2xl border border-neutral-100 bg-neutral-50 overflow-hidden">
                      {/* Module header */}
                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100">
                        <div>
                          <p className="text-sm font-semibold text-neutral-800">{mod.title}</p>
                          <p className="text-xs text-neutral-500">Estimasi: {mod.estimated_days} hari</p>
                        </div>
                        <form action={deleteModule.bind(null, mod.id, programId)}>
                          <button type="submit" className="rounded-xl p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Content list */}
                        {contents.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Konten</p>
                            {contents.map((c) => (
                              <div key={c.id} className="flex items-start justify-between gap-2 rounded-xl bg-white border border-neutral-100 px-3 py-2.5">
                                <div className="flex items-start gap-2 min-w-0">
                                  {c.type === "text" && <FileText className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />}
                                  {c.type === "video" && <Video className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
                                  {c.type === "file" && <Paperclip className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-neutral-700 capitalize">{c.type}</p>
                                    <p className="text-xs text-neutral-500 truncate">
                                      {c.type === "text" && (c.content_text?.slice(0, 60) ?? "")}
                                      {c.type === "video" && c.video_url}
                                      {c.type === "file" && c.file_name}
                                    </p>
                                  </div>
                                </div>
                                <form action={deleteContent.bind(null, c.id, programId)}>
                                  <button type="submit" className="shrink-0 text-neutral-400 hover:text-red-600">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </form>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Tasks list */}
                        {tasks.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Task</p>
                            {tasks.map((t) => (
                              <div key={t.id} className="flex items-start justify-between gap-2 rounded-xl bg-white border border-neutral-100 px-3 py-2.5">
                                <div className="flex items-start gap-2 min-w-0">
                                  <CheckSquare className="h-4 w-4 mt-0.5 shrink-0 text-purple-500" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-neutral-700">{t.title}</p>
                                    <div className="flex gap-2 mt-0.5">
                                      {t.requires_screenshot && <span className="text-xs text-neutral-500">📷 Screenshot</span>}
                                      {t.requires_link && <span className="text-xs text-neutral-500">🔗 Link</span>}
                                    </div>
                                  </div>
                                </div>
                                <form action={deleteTask.bind(null, t.id, programId)}>
                                  <button type="submit" className="shrink-0 text-neutral-400 hover:text-red-600">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </form>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Content form */}
                        <details className="group">
                          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 list-none">
                            <Plus className="h-3.5 w-3.5" /> Tambah Konten
                          </summary>
                          <form action={addContent.bind(null, mod.id, programId)} className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3">
                            <select name="type" className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs bg-white outline-none" required>
                              <option value="text">Teks</option>
                              <option value="video">Video (URL Embed)</option>
                              <option value="file">File (URL)</option>
                            </select>
                            <textarea name="content_text" placeholder="Isi teks konten (untuk tipe Teks)" rows={3}
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none resize-none" />
                            <input name="video_url" placeholder="URL video (YouTube/Vimeo, untuk tipe Video)"
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                            <input name="file_url" placeholder="URL file (untuk tipe File)"
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                            <input name="file_name" placeholder="Nama file (cth: Materi_SOP.pdf)"
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                            <button type="submit" className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                              Simpan Konten
                            </button>
                          </form>
                        </details>

                        {/* Add Task form */}
                        <details className="group">
                          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 list-none">
                            <Plus className="h-3.5 w-3.5" /> Tambah Task
                          </summary>
                          <form action={addTask.bind(null, mod.id, programId)} className="mt-3 rounded-xl border border-purple-100 bg-purple-50 p-3 space-y-3">
                            <input name="title" placeholder="Judul task" required
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                            <textarea name="description" placeholder="Deskripsi / instruksi task (opsional)" rows={2}
                              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none resize-none" />
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                                <input type="checkbox" name="requires_screenshot" className="rounded" />
                                Wajib screenshot
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-neutral-700">
                                <input type="checkbox" name="requires_link" className="rounded" />
                                Wajib link
                              </label>
                            </div>
                            <button type="submit" className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
                              Simpan Task
                            </button>
                          </form>
                        </details>

                        {/* ── Post-Test ── */}
                        <div className="border-t border-neutral-200 pt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
                              <HelpCircle className="h-3.5 w-3.5" /> Post-Test
                            </p>
                            {!postTest && (
                              <form action={createPostTest.bind(null, mod.id, programId)}>
                                <button type="submit" className="flex items-center gap-1 rounded-xl bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                                  <Plus className="h-3 w-3" /> Buat Post-Test
                                </button>
                              </form>
                            )}
                            {postTest && (
                              <form action={deletePostTest.bind(null, (postTest as any).id, programId)}>
                                <button type="submit" className="rounded-xl px-2.5 py-1 text-xs text-red-500 hover:bg-red-50">
                                  Hapus Post-Test
                                </button>
                              </form>
                            )}
                          </div>

                          {postTest && (
                            <div className="space-y-3">
                              <p className="text-xs text-neutral-500">
                                Lulus ≥{(postTest as any).pass_score}% · Maks. {(postTest as any).max_attempts}x percobaan
                              </p>

                              {/* Questions */}
                              {questions.map((q: any, qi: number) => {
                                const opts = [...(q.lms_post_test_options ?? [])].sort((a: any, b: any) => a.order_index - b.order_index);
                                return (
                                  <div key={q.id} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs font-medium text-neutral-800">
                                        <span className="text-neutral-400">S{qi + 1}.</span> {q.question_text}
                                      </p>
                                      <form action={deleteQuestion.bind(null, q.id, programId)}>
                                        <button type="submit" className="shrink-0 text-neutral-300 hover:text-red-500">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </form>
                                    </div>

                                    {/* Options */}
                                    <div className="space-y-1 pl-3">
                                      {opts.map((opt: any) => (
                                        <div key={opt.id} className="flex items-center gap-2">
                                          <form action={setCorrectOption.bind(null, opt.id, q.id, programId)}>
                                            <button type="submit" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${opt.is_correct ? "border-green-500 bg-green-500 text-white" : "border-neutral-300 hover:border-green-400"}`}>
                                              {opt.is_correct && <Check className="h-2.5 w-2.5" />}
                                            </button>
                                          </form>
                                          <span className="flex-1 text-xs text-neutral-700">{opt.option_text}</span>
                                          <form action={deleteOption.bind(null, opt.id, programId)}>
                                            <button type="submit" className="text-neutral-300 hover:text-red-500">
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </form>
                                        </div>
                                      ))}

                                      {/* Add option */}
                                      <form action={addOption.bind(null, q.id, programId)} className="flex items-center gap-2 pt-1">
                                        <input name="option_text" placeholder="Tambah pilihan…" required
                                          className="flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs outline-none" />
                                        <label className="flex items-center gap-1 text-xs text-neutral-500 shrink-0">
                                          <input type="checkbox" name="is_correct" className="rounded" />
                                          Benar
                                        </label>
                                        <button type="submit" className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white shrink-0">+</button>
                                      </form>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Add question */}
                              <form action={addQuestion.bind(null, (postTest as any).id, programId)} className="flex gap-2">
                                <input name="question_text" placeholder="Tambah soal baru…" required
                                  className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none" />
                                <button type="submit" className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 shrink-0">
                                  + Soal
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add Module form */}
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 list-none">
                    <Plus className="h-4 w-4" /> Tambah Modul
                  </summary>
                  <form action={addModule.bind(null, phase.id, programId)} className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                    <input name="title" placeholder="Judul modul" required
                      className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none" />
                    <textarea name="description" placeholder="Deskripsi modul (opsional)" rows={2}
                      className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none resize-none" />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-neutral-600 whitespace-nowrap">Estimasi hari:</label>
                      <input name="estimated_days" type="number" min="1" defaultValue="1"
                        className="w-20 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none" />
                    </div>
                    <button type="submit" className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                      Tambah Modul
                    </button>
                  </form>
                </details>
              </div>
            </div>
          );
        })}

        {/* Add Phase form */}
        <div className="rounded-3xl border border-dashed border-neutral-200 p-6">
          <form action={addPhase.bind(null, programId)} className="space-y-3">
            <p className="text-sm font-semibold text-neutral-700">Tambah Phase Baru</p>
            <div className="flex gap-3">
              <input name="title" placeholder="Nama phase (cth: Phase 1 — Orientasi)" required
                className="flex-1 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
              <input name="duration_days" type="number" min="1" placeholder="Hari"
                className="w-24 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
              <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 whitespace-nowrap">
                <Plus className="inline h-4 w-4 mr-1" />Tambah Phase
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold text-neutral-900">Milestones</h2>
        </div>
        <p className="text-sm text-neutral-500 -mt-2">
          Milestone otomatis diraih ADV saat jumlah modul yang diselesaikan mencapai threshold yang ditentukan.
        </p>

        {milestones.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
            Belum ada milestone. Tambahkan di bawah.
          </div>
        ) : (
          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-3xl border border-neutral-100 bg-white px-5 py-3.5">
                <span className="text-lg">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900">{m.name}</p>
                    {m.is_final && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700">
                        Final · Sertifikat
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    Setelah {m.required_modules_completed} modul selesai
                    {m.description && ` · ${m.description}`}
                  </p>
                </div>
                <form action={deleteMilestone.bind(null, m.id, programId)}>
                  <button type="submit" className="rounded-xl p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-dashed border-neutral-200 p-6">
          <form action={createMilestone.bind(null, programId)} className="space-y-3">
            <p className="text-sm font-semibold text-neutral-700">Tambah Milestone Baru</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="name" placeholder="Nama milestone (cth: Fondasi Siap)" required
                className="rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
              <div className="flex gap-2">
                <input name="emoji" placeholder="🏆" defaultValue="🏆"
                  className="w-16 rounded-2xl border border-neutral-200 px-3 py-2.5 text-center text-sm outline-none focus:border-neutral-400" />
                <input name="required_modules_completed" type="number" min="1" placeholder="Setelah N modul" required
                  className="flex-1 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
              </div>
            </div>
            <input name="description" placeholder="Deskripsi singkat (opsional)"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400" />
            <label className="flex items-start gap-2.5 rounded-2xl border border-neutral-200 px-4 py-3 cursor-pointer hover:border-neutral-300">
              <input name="is_final" type="checkbox" className="mt-0.5 h-4 w-4 accent-neutral-900" />
              <span className="text-sm text-neutral-700">
                Milestone <span className="font-semibold">final (kelulusan)</span>
                <span className="block text-xs text-neutral-400">
                  Saat tercapai, butuh persetujuan Manager dan menerbitkan sertifikat untuk ADV.
                </span>
              </span>
            </label>
            <div className="flex justify-end">
              <button type="submit" className="rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">
                <Plus className="inline h-4 w-4 mr-1" />Tambah Milestone
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
