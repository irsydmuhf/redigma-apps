import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Users, CheckCircle2, PlayCircle, Clock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProgramProgressPage({ params }: Props) {
  const { id: programId } = await params;
  const admin = createAdminClient();

  const [{ data: program }, { data: enrollments }] = await Promise.all([
    admin
      .from("lms_programs")
      .select("id, name")
      .eq("id", programId)
      .single(),
    admin
      .from("lms_program_enrollments")
      .select("id, user_id, enrolled_at, approved_at, status")
      .eq("program_id", programId)
      .in("status", ["active", "completed"])
      .order("enrolled_at", { ascending: true }),
  ]);

  if (!program) notFound();

  const enrollmentList = enrollments ?? [];

  if (enrollmentList.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <Link
            href={`/lms/manager/programs/${programId}/edit`}
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" /> {program.name}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Progress ADV</h1>
        </div>
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <Users className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada ADV aktif</p>
          <p className="text-xs text-neutral-500">ADV yang telah disetujui akan tampil di sini.</p>
        </div>
      </div>
    );
  }

  const enrollmentIds = enrollmentList.map((e) => e.id);
  const userIds = enrollmentList.map((e) => e.user_id);

  // Fetch all data in parallel
  const [{ data: profiles }, { data: allProgress }, { data: phases }] = await Promise.all([
    admin
      .from("lms_user_profiles")
      .select("id, full_name, email")
      .in("id", userIds),
    admin
      .from("lms_module_progress")
      .select(`
        enrollment_id, module_id, status,
        lms_program_modules(id, title, order_index, lms_program_phases(order_index))
      `)
      .in("enrollment_id", enrollmentIds),
    admin
      .from("lms_program_phases")
      .select("id")
      .eq("program_id", programId),
  ]);

  const phaseIds = (phases ?? []).map((p) => p.id);
  const { count: totalModules } = await admin
    .from("lms_program_modules")
    .select("id", { count: "exact", head: true })
    .in("phase_id", phaseIds);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  // Per-enrollment stats
  const stats = enrollmentList.map((e) => {
    const myProgress = (allProgress ?? []).filter((p) => p.enrollment_id === e.id);
    const completedCount = myProgress.filter((p) => p.status === "completed").length;
    const total = totalModules ?? myProgress.length;
    const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    // Current module: in_progress, sorted by phase then module order
    const inProgressRows = myProgress
      .filter((p) => p.status === "in_progress")
      .sort((a, b) => {
        const am = a.lms_program_modules as any;
        const bm = b.lms_program_modules as any;
        const aPhase = Array.isArray(am?.lms_program_phases)
          ? am.lms_program_phases[0]?.order_index ?? 0
          : am?.lms_program_phases?.order_index ?? 0;
        const bPhase = Array.isArray(bm?.lms_program_phases)
          ? bm.lms_program_phases[0]?.order_index ?? 0
          : bm?.lms_program_phases?.order_index ?? 0;
        if (aPhase !== bPhase) return aPhase - bPhase;
        return (am?.order_index ?? 0) - (bm?.order_index ?? 0);
      });

    const currentMod = inProgressRows[0]?.lms_program_modules as any;

    const profile = profileMap[e.user_id];
    const startDate = e.approved_at ?? e.enrolled_at;
    const elapsedDays = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1);

    return {
      enrollmentId: e.id,
      status: e.status,
      elapsedDays,
      profile,
      completedCount,
      total,
      pct,
      currentModTitle: currentMod?.title as string | undefined,
    };
  });

  const activeCount = stats.filter((s) => s.status === "active").length;
  const completedCount = stats.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/lms/manager/programs/${programId}/edit`}
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
          >
            <ChevronLeft className="h-4 w-4" /> {program.name}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Progress ADV</h1>
          <p className="text-sm text-neutral-500">
            {activeCount} ADV aktif
            {completedCount > 0 && ` · ${completedCount} selesai`}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl border border-neutral-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-neutral-900">{stats.length}</p>
          <p className="text-xs text-neutral-500 mt-0.5">Total ADV</p>
        </div>
        <div className="rounded-3xl border border-neutral-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {stats.length > 0 ? Math.round(stats.reduce((sum, s) => sum + s.pct, 0) / stats.length) : 0}%
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">Rata-rata progress</p>
        </div>
        <div className="rounded-3xl border border-neutral-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{completedCount}</p>
          <p className="text-xs text-neutral-500 mt-0.5">ADV Selesai</p>
        </div>
      </div>

      {/* ADV list */}
      <div className="space-y-3">
        {stats.map((s) => (
          <div
            key={s.enrollmentId}
            className="rounded-3xl border border-neutral-100 bg-white p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {s.profile?.full_name ?? "—"}
                </p>
                <p className="text-xs text-neutral-400 truncate">{s.profile?.email ?? "—"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Clock className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-500">Hari ke-{s.elapsedDays}</span>
                {s.status === "completed" ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    Selesai
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    Aktif
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{s.completedCount} / {s.total} modul selesai</span>
                <span className="font-semibold text-neutral-700">{s.pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-neutral-100">
                <div
                  className="h-2 rounded-full bg-neutral-900 transition-all"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>

            {/* Current module */}
            {s.currentModTitle && (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <PlayCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Sedang di: <span className="font-medium text-neutral-700">{s.currentModTitle}</span></span>
              </div>
            )}
            {s.status === "completed" && !s.currentModTitle && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Program selesai</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
