import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookOpen, CheckCircle2, PlayCircle, PlusCircle, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function LmsDashboardPage() {
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  if (user.role === "manager" || user.role === "admin") {
    redirect("/lms/manager/dashboard");
  }

  const supabase = await createClient();

  // Enrollment aktif terbaru
  const { data: enrollment } = await supabase
    .from("lms_program_enrollments")
    .select("id, enrolled_at, approved_at, lms_programs(id, name, description)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Pending enrollment untuk banner
  const { data: pendingEnrollments } = await supabase
    .from("lms_program_enrollments")
    .select("id, lms_programs(name)")
    .eq("user_id", user.id)
    .eq("status", "pending");

  const hasPending = (pendingEnrollments ?? []).length > 0;

  // Jika tidak ada enrollment aktif
  if (!enrollment) {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Selamat datang, {user.fullName}
          </h1>
          <p className="text-sm text-neutral-600">ADV Onboarding — pantau progress belajar Anda</p>
        </div>

        {hasPending && (
          <div className="rounded-3xl border border-yellow-100 bg-yellow-50 p-5 space-y-1">
            <p className="text-sm font-semibold text-yellow-800">Menunggu Persetujuan Manager</p>
            <p className="text-xs text-yellow-700">
              Pendaftaran Anda sedang diproses. Anda akan bisa mulai belajar setelah disetujui.
            </p>
          </div>
        )}

        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-4">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada program aktif</p>
          <p className="text-xs text-neutral-500">
            Ikuti program onboarding untuk mulai belajar.
          </p>
          <Link
            href="/lms/join"
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            <PlusCircle className="h-4 w-4" />
            Ikuti Program
          </Link>
        </div>
      </div>
    );
  }

  const prog = Array.isArray(enrollment.lms_programs)
    ? enrollment.lms_programs[0]
    : enrollment.lms_programs;

  // Module progress dengan data modul
  const { data: progresses } = await supabase
    .from("lms_module_progress")
    .select(`
      module_id, status,
      lms_program_modules(
        id, title, description, order_index, estimated_days,
        lms_program_phases(order_index)
      )
    `)
    .eq("enrollment_id", enrollment.id);

  // Sort by phase order, then module order
  const sorted = (progresses ?? [])
    .filter((p) => p.lms_program_modules)
    .sort((a, b) => {
      const am = a.lms_program_modules as any;
      const bm = b.lms_program_modules as any;
      const aPhase = Array.isArray(am.lms_program_phases) ? am.lms_program_phases[0]?.order_index ?? 0 : am.lms_program_phases?.order_index ?? 0;
      const bPhase = Array.isArray(bm.lms_program_phases) ? bm.lms_program_phases[0]?.order_index ?? 0 : bm.lms_program_phases?.order_index ?? 0;
      if (aPhase !== bPhase) return aPhase - bPhase;
      return (am.order_index ?? 0) - (bm.order_index ?? 0);
    });

  const totalModules = sorted.length;
  const completedModules = sorted.filter((p) => p.status === "completed").length;
  const progressPct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  const todayTask = sorted.find((p) => p.status === "in_progress");
  const todayMod = todayTask?.lms_program_modules as any;
  const todayModIdx = todayTask ? sorted.indexOf(todayTask) + 1 : null;

  const completedList = sorted.filter((p) => p.status === "completed");

  // Day counter
  const startDate = enrollment.approved_at ?? enrollment.enrolled_at;
  const elapsedDays = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1);
  const totalDays = sorted.reduce((acc, p) => acc + ((p.lms_program_modules as any)?.estimated_days ?? 1), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Selamat datang, {user.fullName}
        </h1>
        <p className="text-sm text-neutral-500">
          Program: <span className="font-medium text-neutral-700">{prog?.name}</span>
          {totalDays > 0 && (
            <> · Hari ke-{elapsedDays} dari {totalDays}</>
          )}
        </p>
      </div>

      {/* Progress + Milestone */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Progress */}
        <div className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4">
          <p className="text-sm font-semibold text-neutral-600">Progress Keseluruhan</p>
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold text-neutral-900">{progressPct}%</span>
              <span className="text-sm text-neutral-500">{completedModules} / {totalModules} modul selesai</span>
            </div>
            <div className="h-2 w-full rounded-full bg-neutral-100">
              <div
                className="h-2 rounded-full bg-neutral-900 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <Link
            href={`/lms/program/${prog?.id}`}
            className="flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-neutral-900"
          >
            Lihat semua modul <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Milestone placeholder */}
        <div className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-3">
          <p className="text-sm font-semibold text-neutral-600">Milestone</p>
          <p className="text-xs text-neutral-400 italic">
            Milestone akan tersedia setelah modul pertama diselesaikan.
          </p>
        </div>
      </div>

      {/* Tugas Hari Ini */}
      {todayTask && todayMod && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Tugas Hari Ini</h2>
          <div className="rounded-3xl border border-neutral-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Modul {todayModIdx}</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    Sedang Dikerjakan
                  </span>
                </div>
                <p className="text-base font-semibold text-neutral-900">{todayMod.title}</p>
                {todayMod.description && (
                  <p className="text-sm text-neutral-500 line-clamp-2">{todayMod.description}</p>
                )}
                {todayMod.estimated_days && (
                  <p className="flex items-center gap-1 text-xs text-neutral-400">
                    <PlayCircle className="h-3.5 w-3.5" />
                    {todayMod.estimated_days} hari
                  </p>
                )}
              </div>
              <Link
                href={`/lms/module/${todayMod.id}`}
                className="shrink-0 flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
              >
                Lanjutkan <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Modul Selesai */}
      {completedList.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Modul Selesai</h2>
          <div className="space-y-2">
            {completedList.map((p, idx) => {
              const mod = p.lms_program_modules as any;
              const modIdx = sorted.indexOf(p) + 1;
              return (
                <div
                  key={p.module_id}
                  className="flex items-center gap-4 rounded-3xl border border-neutral-100 bg-white px-5 py-4"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{mod?.title}</p>
                    <p className="text-xs text-neutral-400">Modul {modIdx}</p>
                  </div>
                  {/* Skor akan ditampilkan setelah Phase 4 (post-test) */}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All done */}
      {totalModules > 0 && completedModules === totalModules && (
        <div className="rounded-3xl border border-green-100 bg-green-50 p-6 text-center space-y-2">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" />
          <p className="text-sm font-semibold text-green-800">Semua modul selesai!</p>
          <p className="text-xs text-green-700">
            Selamat, kamu telah menyelesaikan seluruh program onboarding.
          </p>
        </div>
      )}
    </div>
  );
}
