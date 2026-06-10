import { createAdminClient } from "@/lib/supabase/admin";
import { BarChart2, Users, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function ManagerProgressPage() {
  const admin = createAdminClient();

  const { data: programs } = await admin
    .from("lms_programs")
    .select("id, name, description")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (!programs || programs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Progress ADV</h1>
          <p className="text-sm text-neutral-500">Pantau kemajuan belajar ADV per program.</p>
        </div>
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <BarChart2 className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada program</p>
        </div>
      </div>
    );
  }

  // Enrollment counts per program
  const { data: enrollments } = await admin
    .from("lms_program_enrollments")
    .select("program_id, status")
    .in("program_id", programs.map((p) => p.id))
    .in("status", ["active", "completed"]);

  const enrollMap: Record<string, { active: number; completed: number }> = {};
  for (const e of enrollments ?? []) {
    if (!enrollMap[e.program_id]) enrollMap[e.program_id] = { active: 0, completed: 0 };
    if (e.status === "active") enrollMap[e.program_id].active++;
    if (e.status === "completed") enrollMap[e.program_id].completed++;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Progress ADV</h1>
        <p className="text-sm text-neutral-500">Pilih program untuk melihat detail kemajuan tiap ADV.</p>
      </div>

      <div className="space-y-3">
        {programs.map((p) => {
          const counts = enrollMap[p.id] ?? { active: 0, completed: 0 };
          return (
            <Link
              key={p.id}
              href={`/lms/manager/programs/${p.id}/progress`}
              className="flex items-center gap-4 rounded-3xl border border-neutral-100 bg-white p-5 transition hover:border-neutral-200 hover:shadow-sm"
            >
              <div className="mesh-blue grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{p.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {counts.active} ADV aktif
                  {counts.completed > 0 && ` · ${counts.completed} selesai`}
                  {counts.active === 0 && counts.completed === 0 && " · Belum ada ADV"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
