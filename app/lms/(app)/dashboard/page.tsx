import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookOpen, Clock } from "lucide-react";

export default async function LmsDashboardPage() {
  const user = await getCurrentLmsUser();
  if (!user) redirect("/lms/login");

  // Redirect manager/admin ke dashboard mereka
  if (user.role === "manager" || user.role === "admin") {
    redirect("/lms/manager/dashboard");
  }

  const supabase = await createClient();

  // Ambil enrollment ADV
  const { data: enrollments } = await supabase
    .from("lms_program_enrollments")
    .select("id, status, enrolled_at, lms_programs(id, name, description)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false });

  const activeEnrollments = (enrollments ?? []).filter(
    (e) => e.status === "active"
  );
  const pendingEnrollments = (enrollments ?? []).filter(
    (e) => e.status === "pending"
  );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Selamat datang, {user.fullName}
        </h1>
        <p className="text-sm text-neutral-600">
          ADV Onboarding — pantau progress belajar Anda
        </p>
      </div>

      {pendingEnrollments.length > 0 && (
        <div className="rounded-3xl border border-yellow-100 bg-yellow-50 p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            <p className="text-sm font-semibold text-yellow-800">
              Menunggu Persetujuan Manager
            </p>
          </div>
          <p className="text-sm text-yellow-700">
            Pendaftaran Anda ke{" "}
            {pendingEnrollments.length === 1
              ? "1 program"
              : `${pendingEnrollments.length} program`}{" "}
            sedang menunggu persetujuan Manager. Anda akan mendapat notifikasi
            setelah disetujui.
          </p>
          <ul className="mt-2 space-y-1">
            {pendingEnrollments.map((e) => {
              const prog = Array.isArray(e.lms_programs)
                ? e.lms_programs[0]
                : e.lms_programs;
              return (
                <li key={e.id} className="text-sm font-medium text-yellow-800">
                  • {prog?.name ?? "Program"}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeEnrollments.length === 0 && pendingEnrollments.length === 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center space-y-3">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">
            Belum terdaftar di program manapun
          </p>
          <p className="text-xs text-neutral-500">
            Minta invite link dari Manager Anda untuk bergabung ke program onboarding.
          </p>
        </div>
      )}

      {activeEnrollments.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-neutral-900">Program Aktif</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeEnrollments.map((e) => {
              const prog = Array.isArray(e.lms_programs)
                ? e.lms_programs[0]
                : e.lms_programs;
              return (
                <a
                  key={e.id}
                  href={`/lms/program/${prog?.id}`}
                  className="block rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="mesh-blue grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        {prog?.name}
                      </p>
                      {prog?.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                          {prog.description}
                        </p>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
