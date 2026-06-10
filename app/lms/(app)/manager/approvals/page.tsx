import { createAdminClient } from "@/lib/supabase/admin";
import { approveEnrollment, rejectEnrollment } from "./actions";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export default async function LmsApprovalsPage() {
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("lms_program_enrollments")
    .select(
      "id, enrolled_at, lms_user_profiles(full_name, email), lms_programs(name)"
    )
    .eq("status", "pending")
    .order("enrolled_at", { ascending: true });

  const enrollments = pending ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Persetujuan Pendaftaran
        </h1>
        <p className="text-sm text-neutral-600">
          {enrollments.length === 0
            ? "Tidak ada pendaftaran yang menunggu."
            : `${enrollments.length} pendaftaran menunggu persetujuan Anda.`}
        </p>
      </div>

      {enrollments.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <p className="text-sm font-medium text-neutral-700">Semua sudah diproses!</p>
          <p className="text-xs text-neutral-500">
            Tidak ada pendaftaran ADV yang menunggu persetujuan.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left">
                  <th className="px-6 py-4 font-semibold text-neutral-700">ADV</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Program</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Daftar</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {enrollments.map((e) => {
                  const adv = Array.isArray(e.lms_user_profiles)
                    ? e.lms_user_profiles[0]
                    : e.lms_user_profiles;
                  const prog = Array.isArray(e.lms_programs)
                    ? e.lms_programs[0]
                    : e.lms_programs;
                  const enrolledDate = new Date(e.enrolled_at).toLocaleDateString(
                    "id-ID",
                    { day: "numeric", month: "short", year: "numeric" }
                  );

                  return (
                    <tr key={e.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-neutral-900">
                          {adv?.full_name ?? "—"}
                        </p>
                        <p className="text-xs text-neutral-500">{adv?.email}</p>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">
                        {prog?.name ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <Clock className="h-3.5 w-3.5" />
                          {enrolledDate}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <form
                            action={approveEnrollment.bind(null, e.id)}
                          >
                            <button
                              type="submit"
                              className="flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Setujui
                            </button>
                          </form>
                          <form
                            action={rejectEnrollment.bind(null, e.id)}
                          >
                            <button
                              type="submit"
                              className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Tolak
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
