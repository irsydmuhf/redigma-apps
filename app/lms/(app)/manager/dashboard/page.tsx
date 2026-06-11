import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Users, TrendingUp, AlertTriangle, GraduationCap, ClipboardCheck, BookOpen, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { summarizeEnrollment } from "@/lib/lms/progress";

interface Props {
  searchParams: Promise<{ program?: string }>;
}

export default async function LmsManagerDashboardPage({ searchParams }: Props) {
  const { program: programFilter } = await searchParams;
  const user = await getCurrentLmsUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Daftar program untuk filter
  const { data: programs } = await admin
    .from("lms_programs")
    .select("id, name")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const activeFilter = programFilter && (programs ?? []).some((p) => p.id === programFilter)
    ? programFilter
    : null;

  // Enrollment aktif + selesai (opsional difilter per program)
  let enrollQuery = admin
    .from("lms_program_enrollments")
    .select("id, user_id, status, program_id")
    .in("status", ["active", "completed"]);
  if (activeFilter) enrollQuery = enrollQuery.eq("program_id", activeFilter);
  const { data: enrollments } = await enrollQuery;

  // Pending (untuk banner)
  let pendingQuery = admin
    .from("lms_program_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (activeFilter) pendingQuery = pendingQuery.eq("program_id", activeFilter);
  const { count: pendingCount } = await pendingQuery;

  const enrollmentList = enrollments ?? [];
  const enrollmentIds = enrollmentList.map((e) => e.id);
  const relevantProgramIds = [...new Set(enrollmentList.map((e) => e.program_id))];

  // Module progress untuk semua enrollment relevan
  const { data: allProgress } = enrollmentIds.length
    ? await admin
        .from("lms_module_progress")
        .select(`
          enrollment_id, module_id, status, started_at,
          lms_program_modules(id, order_index, estimated_days, lms_program_phases(order_index))
        `)
        .in("enrollment_id", enrollmentIds)
    : { data: [] as any[] };

  // Total modul per program (phase → modul, dihitung manual agar deterministik)
  const { data: phaseRows } = relevantProgramIds.length
    ? await admin
        .from("lms_program_phases")
        .select("id, program_id")
        .in("program_id", relevantProgramIds)
    : { data: [] as any[] };

  const phaseToProgram: Record<string, string> = {};
  for (const ph of phaseRows ?? []) phaseToProgram[ph.id] = ph.program_id;
  const allPhaseIds = (phaseRows ?? []).map((p) => p.id);

  const { data: modRows } = allPhaseIds.length
    ? await admin.from("lms_program_modules").select("id, phase_id").in("phase_id", allPhaseIds)
    : { data: [] as any[] };

  const totalModulesByProgram: Record<string, number> = {};
  for (const m of modRows ?? []) {
    const pid = phaseToProgram[(m as any).phase_id];
    if (pid) totalModulesByProgram[pid] = (totalModulesByProgram[pid] ?? 0) + 1;
  }

  let onTrack = 0;
  let atRisk = 0;
  let lulus = 0;
  for (const e of enrollmentList) {
    if (e.status === "completed") {
      lulus++;
      continue;
    }
    const myProgress = (allProgress ?? []).filter((p) => p.enrollment_id === e.id);
    const total = totalModulesByProgram[e.program_id] ?? myProgress.length;
    const summary = summarizeEnrollment(myProgress, total);
    if (summary.isAtRisk) atRisk++;
    else onTrack++;
  }
  const activeCount = onTrack + atRisk;

  // Riwayat ADV lulus (status completed)
  const completedEnrollments = enrollmentList.filter((e) => e.status === "completed");
  const completedUserIds = [...new Set(completedEnrollments.map((e) => e.user_id))];
  const completedIds = completedEnrollments.map((e) => e.id);
  const [{ data: gradProfiles }, { data: gradMilestones }] = await Promise.all([
    completedUserIds.length
      ? admin.from("lms_user_profiles").select("id, full_name, email").in("id", completedUserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
    completedIds.length
      ? admin.from("lms_adv_milestones").select("enrollment_id, approved_at").eq("status", "approved").in("enrollment_id", completedIds)
      : Promise.resolve({ data: [] as { enrollment_id: string; approved_at: string | null }[] }),
  ]);
  const gradProfMap = Object.fromEntries((gradProfiles ?? []).map((p) => [p.id, p]));
  const progNameMap = Object.fromEntries((programs ?? []).map((p) => [p.id, p.name]));
  const gradDateMap: Record<string, string> = {};
  for (const ms of gradMilestones ?? []) {
    const at = ms.approved_at as string | null;
    if (!at) continue;
    if (!gradDateMap[ms.enrollment_id] || at > gradDateMap[ms.enrollment_id]) gradDateMap[ms.enrollment_id] = at;
  }

  const stats = [
    { label: "ADV Aktif", value: activeCount, icon: Users, color: "text-neutral-900", bg: "bg-neutral-100", iconColor: "text-neutral-600" },
    { label: "On-Track", value: onTrack, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", iconColor: "text-blue-600" },
    { label: "At-Risk", value: atRisk, icon: AlertTriangle, color: atRisk > 0 ? "text-red-600" : "text-neutral-900", bg: atRisk > 0 ? "bg-red-50" : "bg-neutral-100", iconColor: atRisk > 0 ? "text-red-600" : "text-neutral-600" },
    { label: "Lulus", value: lulus, icon: GraduationCap, color: "text-green-600", bg: "bg-green-50", iconColor: "text-green-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Dashboard Manager</h1>
        <p className="text-sm text-neutral-600">Selamat datang, {user.fullName}</p>
      </div>

      {/* Filter per program */}
      {(programs ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-neutral-400">Filter:</span>
          <Link
            href="/lms/manager/dashboard"
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !activeFilter ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Semua Program
          </Link>
          {(programs ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/lms/manager/dashboard?program=${p.id}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeFilter === p.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-3">
              <div className={`grid h-10 w-10 place-items-center rounded-2xl ${s.bg}`}>
                <Icon className={`h-5 w-5 ${s.iconColor}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-neutral-500">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {(pendingCount ?? 0) > 0 && (
        <div className="rounded-3xl border border-yellow-100 bg-yellow-50 p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-sm font-medium text-yellow-800">
              Ada {pendingCount} pendaftaran ADV yang menunggu persetujuan Anda.
            </p>
          </div>
          <Link
            href="/lms/manager/approvals"
            className="shrink-0 rounded-2xl bg-yellow-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-yellow-700"
          >
            Tinjau
          </Link>
        </div>
      )}

      {atRisk > 0 && (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm font-medium text-red-800">
              {atRisk} ADV tertinggal dari jadwal modulnya. Tinjau dan beri dorongan.
            </p>
          </div>
          <Link
            href="/lms/manager/progress"
            className="shrink-0 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Lihat Progress
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/lms/manager/programs" className="rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm flex items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Kelola Program</p>
            <p className="text-xs text-neutral-500">Buat & edit kurikulum</p>
          </div>
        </Link>

        <Link href="/lms/manager/progress" className="rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm flex items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-neutral-100">
            <Users className="h-5 w-5 text-neutral-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Progress ADV</p>
            <p className="text-xs text-neutral-500">Pantau kemajuan per ADV</p>
          </div>
        </Link>

        <Link href="/lms/manager/approvals" className="rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm flex items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-green-50">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Persetujuan ADV</p>
            <p className="text-xs text-neutral-500">Approve atau tolak pendaftaran</p>
          </div>
        </Link>
      </div>

      {/* Riwayat ADV lulus */}
      {completedEnrollments.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
            <GraduationCap className="h-5 w-5 text-green-600" /> Riwayat ADV Lulus ({completedEnrollments.length})
          </h2>
          <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left">
                    <th className="px-6 py-4 font-semibold text-neutral-700">ADV</th>
                    <th className="px-6 py-4 font-semibold text-neutral-700">Program</th>
                    <th className="px-6 py-4 font-semibold text-neutral-700">Tanggal Lulus</th>
                    <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {completedEnrollments.map((e) => {
                    const prof = gradProfMap[e.user_id];
                    const date = gradDateMap[e.id];
                    return (
                      <tr key={e.id} className="hover:bg-neutral-50/50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-neutral-900">{prof?.full_name ?? "—"}</p>
                          <p className="text-xs text-neutral-400">{prof?.email}</p>
                        </td>
                        <td className="px-6 py-4 text-neutral-700">{progNameMap[e.program_id] ?? "—"}</td>
                        <td className="px-6 py-4 text-neutral-500 text-xs">
                          {date ? new Date(date).toLocaleDateString("id-ID", { dateStyle: "medium" }) : "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/lms/manager/adv/${e.id}`} className="text-xs font-medium text-brand hover:underline">
                            Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
