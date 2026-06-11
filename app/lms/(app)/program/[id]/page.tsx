import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle2, PlayCircle, BookOpen, ChevronRight, ChevronLeft } from "lucide-react";

interface Props { params: Promise<{ id: string }> }

const STATUS_CONFIG = {
  locked:      { icon: Lock,         color: "text-neutral-400", bg: "bg-neutral-100", label: "Terkunci" },
  in_progress: { icon: PlayCircle,   color: "text-blue-600",    bg: "bg-blue-50",     label: "Sedang Dikerjakan" },
  completed:   { icon: CheckCircle2, color: "text-green-600",   bg: "bg-green-50",    label: "Selesai" },
};

export default async function ProgramPage({ params }: Props) {
  const { id: programId } = await params;
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  const supabase = await createClient();
  const admin = createAdminClient();

  // Manager/admin pakai admin client untuk baca program tanpa RLS
  const client = user.role === "adv" ? supabase : admin;

  const { data: program } = await client
    .from("lms_programs")
    .select(`
      id, name, description,
      lms_program_phases (
        id, title, order_index, duration_days,
        lms_program_modules (
          id, title, description, order_index, estimated_days
        )
      )
    `)
    .eq("id", programId)
    .single();

  if (!program) notFound();

  const phases = [...(program.lms_program_phases ?? [])].sort((a, b) => a.order_index - b.order_index);

  // Ambil enrollment + module progress untuk ADV
  let progressMap: Record<string, string> = {};
  let enrollmentId: string | null = null;

  if (user.role === "adv") {
    const { data: enrollment } = await supabase
      .from("lms_program_enrollments")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("program_id", programId)
      .single();

    // Aktif → belajar; completed → boleh buka untuk review (read-only).
    if (!enrollment || (enrollment.status !== "active" && enrollment.status !== "completed")) {
      redirect("/lms/dashboard");
    }

    enrollmentId = enrollment.id;

    const { data: progresses } = await supabase
      .from("lms_module_progress")
      .select("module_id, status")
      .eq("enrollment_id", enrollment.id);

    for (const p of progresses ?? []) {
      progressMap[p.module_id] = p.status;
    }
  }

  const totalModules = phases.reduce((acc, ph) => acc + (ph.lms_program_modules?.length ?? 0), 0);
  const completedModules = Object.values(progressMap).filter((s) => s === "completed").length;

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link
        href={user.role === "adv" ? "/lms/programs" : "/lms/manager/programs"}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ChevronLeft className="h-4 w-4" />
        {user.role === "adv" ? "Program Saya" : "Program"}
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{program.name}</h1>
        {program.description && (
          <p className="text-sm text-neutral-600">{program.description}</p>
        )}
        {user.role === "adv" && totalModules > 0 && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Progress</span>
              <span>{completedModules}/{totalModules} modul selesai</span>
            </div>
            <div className="h-2 w-full rounded-full bg-neutral-100">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Learning path */}
      {phases.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">Kurikulum belum tersedia.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {phases.map((phase, phaseIdx) => {
            const modules = [...(phase.lms_program_modules ?? [])].sort((a, b) => a.order_index - b.order_index);
            return (
              <div key={phase.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
                    {phaseIdx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900">{phase.title}</p>
                    {phase.duration_days && (
                      <p className="text-xs text-neutral-500">{phase.duration_days} hari</p>
                    )}
                  </div>
                </div>

                <div className="ml-3 border-l-2 border-neutral-100 pl-6 space-y-2">
                  {modules.map((mod) => {
                    const status = progressMap[mod.id] ?? (user.role === "adv" ? "locked" : "in_progress");
                    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.locked;
                    const Icon = cfg.icon;
                    const canOpen = user.role !== "adv" || status !== "locked";

                    const card = (
                      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
                        canOpen
                          ? "border-neutral-100 bg-white hover:border-neutral-200 hover:shadow-sm cursor-pointer"
                          : "border-neutral-100 bg-neutral-50 opacity-60 cursor-not-allowed"
                      }`}>
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cfg.bg}`}>
                          <Icon className={`h-4 w-4 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900">{mod.title}</p>
                          <p className="text-xs text-neutral-500">
                            {cfg.label} · {mod.estimated_days} hari
                          </p>
                        </div>
                        {canOpen && <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />}
                      </div>
                    );

                    return canOpen ? (
                      <Link key={mod.id} href={`/lms/module/${mod.id}`}>
                        {card}
                      </Link>
                    ) : (
                      <div key={mod.id}>{card}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
