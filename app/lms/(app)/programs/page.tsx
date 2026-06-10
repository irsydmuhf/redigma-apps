import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookOpen, Clock, PlusCircle, ChevronRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default async function ProgramSayaPage() {
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");
  if (user.role !== "adv") redirect("/lms/dashboard");

  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("lms_program_enrollments")
    .select("id, status, enrolled_at, approved_at, lms_programs(id, name, description)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false });

  const list = enrollments ?? [];
  const active = list.filter((e) => e.status === "active");
  const pending = list.filter((e) => e.status === "pending");
  const rejected = list.filter((e) => e.status === "rejected");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Program Saya</h1>
          <p className="text-sm text-neutral-600">
            Semua program onboarding yang kamu ikuti.
          </p>
        </div>
        <Link
          href="/lms/join"
          className="shrink-0 flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          <PlusCircle className="h-4 w-4" />
          Ikuti Program
        </Link>
      </div>

      {list.length === 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada program</p>
          <p className="text-xs text-neutral-500">
            Minta token dari Manager, lalu klik "Ikuti Program" untuk mendaftar.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Aktif</h2>
          <div className="space-y-2">
            {active.map((e) => {
              const prog = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
              return (
                <Link
                  key={e.id}
                  href={`/lms/program/${prog?.id}`}
                  className="flex items-center gap-4 rounded-3xl border border-neutral-100 bg-white p-5 transition hover:border-neutral-200 hover:shadow-sm"
                >
                  <div className="mesh-blue grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{prog?.name}</p>
                    {prog?.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{prog.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      Aktif
                    </span>
                    <ChevronRight className="h-4 w-4 text-neutral-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Menunggu Persetujuan</h2>
          <div className="space-y-2">
            {pending.map((e) => {
              const prog = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-4 rounded-3xl border border-yellow-100 bg-yellow-50 p-5"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-yellow-100">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{prog?.name}</p>
                    <p className="mt-0.5 text-xs text-yellow-700">Menunggu persetujuan Manager</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                    Pending
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Ditolak</h2>
          <div className="space-y-2">
            {rejected.map((e) => {
              const prog = Array.isArray(e.lms_programs) ? e.lms_programs[0] : e.lms_programs;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-4 rounded-3xl border border-neutral-100 bg-neutral-50 p-5 opacity-70"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neutral-100">
                    <BookOpen className="h-5 w-5 text-neutral-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-700">{prog?.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Pendaftaran ditolak — daftar ulang dengan token baru
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                    Ditolak
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
