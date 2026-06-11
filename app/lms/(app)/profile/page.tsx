import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Award, Download, BookOpen, GraduationCap } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  adv: "Advertiser",
  manager: "Manager",
  admin: "Admin",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-blue-50 text-blue-700" },
  completed: { label: "Lulus", cls: "bg-green-100 text-green-700" },
  pending: { label: "Menunggu", cls: "bg-yellow-100 text-yellow-700" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-700" },
};

export default async function LmsProfilePage() {
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  const admin = createAdminClient();

  const { data: rawEnrollments } = await admin
    .from("lms_program_enrollments")
    .select("id, status, enrolled_at, program_id, lms_programs(name)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false });

  const enrollments = rawEnrollments ?? [];
  const enrollIds = enrollments.map((e) => e.id);

  const [{ data: progress }, { data: advMs }] = await Promise.all([
    enrollIds.length
      ? admin.from("lms_module_progress").select("enrollment_id, status").in("enrollment_id", enrollIds)
      : Promise.resolve({ data: [] as { enrollment_id: string; status: string }[] }),
    enrollIds.length
      ? admin
          .from("lms_adv_milestones")
          .select("enrollment_id, milestone_id, status, certificate_url")
          .in("enrollment_id", enrollIds)
      : Promise.resolve({ data: [] as { enrollment_id: string; milestone_id: string; status: string; certificate_url: string | null }[] }),
  ]);

  // Progress per enrollment
  const progByEnroll: Record<string, { total: number; done: number }> = {};
  for (const p of progress ?? []) {
    const e = (progByEnroll[p.enrollment_id] ??= { total: 0, done: 0 });
    e.total += 1;
    if (p.status === "completed") e.done += 1;
  }

  // Milestone names untuk badge & sertifikat
  const msIds = [...new Set((advMs ?? []).map((a) => a.milestone_id))];
  const { data: milestones } = msIds.length
    ? await admin.from("lms_milestones").select("id, name, emoji").in("id", msIds)
    : { data: [] as { id: string; name: string; emoji: string }[] };
  const msMap = Object.fromEntries((milestones ?? []).map((m) => [m.id, m]));

  const progName = Object.fromEntries(
    enrollments.map((e) => {
      const p = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
      return [e.id, p?.name ?? "Program"];
    })
  );

  const badges = (advMs ?? []).filter((a) => a.status !== "rejected");
  const certificates = (advMs ?? []).filter((a) => a.status === "approved" && a.certificate_url);

  return (
    <div className="space-y-6 pb-16">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Profil Saya</h1>

      {/* Kartu akun */}
      <div className="flex items-center gap-4 rounded-3xl border border-neutral-100 bg-white p-6">
        <div className="mesh-blue grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-white">
          {user.fullName?.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-neutral-900">{user.fullName}</p>
          <p className="text-sm text-neutral-500">{user.email}</p>
          <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </div>
      </div>

      {/* Sertifikat */}
      {certificates.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
            <Award className="h-5 w-5 text-yellow-500" /> Sertifikat
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {certificates.map((c) => (
              <div key={c.enrollment_id + c.milestone_id} className="flex items-center gap-3 rounded-3xl border border-yellow-200 bg-yellow-50/40 p-4">
                <Award className="h-8 w-8 shrink-0 text-yellow-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{msMap[c.milestone_id]?.name ?? "Kelulusan"}</p>
                  <p className="truncate text-xs text-neutral-500">{progName[c.enrollment_id]}</p>
                </div>
                <a href={c.certificate_url!} target="_blank" rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-700">
                  <Download className="h-3.5 w-3.5" /> Unduh
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badge milestone */}
      {badges.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
            <GraduationCap className="h-5 w-5 text-brand" /> Badge & Pencapaian
          </h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b.enrollment_id + b.milestone_id}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-100 bg-white px-3 py-1.5 text-sm">
                <span className="text-base">{msMap[b.milestone_id]?.emoji ?? "🏆"}</span>
                <span className="font-medium text-neutral-700">{msMap[b.milestone_id]?.name ?? "Milestone"}</span>
                {b.status === "pending_approval" && (
                  <span className="text-xs text-yellow-600">(menunggu)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Program */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
          <BookOpen className="h-5 w-5 text-neutral-500" /> Program Saya
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-neutral-500">Belum mengikuti program apa pun.</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((e) => {
              const pr = progByEnroll[e.id] ?? { total: 0, done: 0 };
              const pct = pr.total > 0 ? Math.round((pr.done / pr.total) * 100) : 0;
              const badge = STATUS_BADGE[e.status] ?? { label: e.status, cls: "bg-neutral-100 text-neutral-600" };
              return (
                <div key={e.id} className="rounded-3xl border border-neutral-100 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-neutral-900">{progName[e.id]}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  {(e.status === "active" || e.status === "completed") && pr.total > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-neutral-500">
                        <span>Progress</span>
                        <span>{pr.done} / {pr.total} modul</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-neutral-100">
                        <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
