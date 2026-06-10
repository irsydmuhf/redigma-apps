import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { Users, BookOpen, ClipboardCheck, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default async function LmsManagerDashboardPage() {
  const user = await getCurrentLmsUser();
  if (!user) return null;

  const supabase = await createClient();

  const [{ count: totalPrograms }, { count: totalEnrollments }, { count: pendingCount }] =
    await Promise.all([
      supabase
        .from("lms_programs")
        .select("id", { count: "exact", head: true })
        .eq("is_archived", false),
      supabase
        .from("lms_program_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("lms_program_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const stats = [
    {
      label: "Program Aktif",
      value: String(totalPrograms ?? 0),
      icon: BookOpen,
      variant: "blue",
    },
    {
      label: "ADV Aktif",
      value: String(totalEnrollments ?? 0),
      icon: Users,
      variant: "green",
    },
    {
      label: "Menunggu Persetujuan",
      value: String(pendingCount ?? 0),
      icon: ClipboardCheck,
      variant: pendingCount && pendingCount > 0 ? "red" : "yellow",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Dashboard Manager
        </h1>
        <p className="text-sm text-neutral-600">
          Selamat datang, {user.fullName}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-3"
            >
              <div
                className={`mesh-${s.variant} grid h-10 w-10 place-items-center rounded-2xl text-white shadow`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-900">{s.value}</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/lms/manager/programs"
          className="rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm flex items-center gap-4"
        >
          <div className="mesh-blue grid h-11 w-11 place-items-center rounded-2xl text-white shadow">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Kelola Program</p>
            <p className="text-xs text-neutral-500">Buat & edit kurikulum onboarding</p>
          </div>
        </Link>

        <Link
          href="/lms/manager/approvals"
          className="rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm flex items-center gap-4"
        >
          <div className="mesh-green grid h-11 w-11 place-items-center rounded-2xl text-white shadow">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Persetujuan ADV</p>
            <p className="text-xs text-neutral-500">Approve atau tolak pendaftaran</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
