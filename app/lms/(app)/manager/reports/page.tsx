import { createAdminClient } from "@/lib/supabase/admin";
import { getReportRows } from "@/lib/lms/reports";
import { FileSpreadsheet, FileText, BarChart2 } from "lucide-react";
import Link from "next/link";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-blue-50 text-blue-700" },
  completed: { label: "Lulus", cls: "bg-green-100 text-green-700" },
};

interface Props {
  searchParams: Promise<{ program?: string }>;
}

export default async function LmsReportsPage({ searchParams }: Props) {
  const { program: programFilter } = await searchParams;
  const admin = createAdminClient();

  const { data: programs } = await admin
    .from("lms_programs")
    .select("id, name")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  const activeFilter =
    programFilter && (programs ?? []).some((p) => p.id === programFilter) ? programFilter : null;

  const rows = await getReportRows(activeFilter);
  const exportQs = activeFilter ? `&program=${activeFilter}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Laporan Progress</h1>
          <p className="text-sm text-neutral-600">{rows.length} ADV (aktif &amp; lulus).</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/lms/manager/reports/export?format=xlsx${exportQs}`}
            className="flex items-center gap-1.5 rounded-2xl border border-green-100 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition hover:bg-green-100"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </a>
          <a
            href={`/lms/manager/reports/export?format=pdf${exportQs}`}
            className="flex items-center gap-1.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <FileText className="h-4 w-4" /> PDF
          </a>
        </div>
      </div>

      {/* Filter per program */}
      {(programs ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-neutral-400">Filter:</span>
          <Link
            href="/lms/manager/reports"
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !activeFilter ? "bg-brand text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Semua Program
          </Link>
          {(programs ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/lms/manager/reports?program=${p.id}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeFilter === p.id ? "bg-brand text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <BarChart2 className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada data ADV.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left">
                  <th className="px-6 py-4 font-semibold text-neutral-700">Nama</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Program</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Status</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Progress</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Rata2 Post-test</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Tanggal Lulus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {rows.map((r, i) => {
                  const badge = STATUS_BADGE[r.status] ?? { label: r.status, cls: "bg-neutral-100 text-neutral-600" };
                  return (
                    <tr key={i} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-neutral-900">{r.advName}</p>
                        <p className="text-xs text-neutral-400">{r.advEmail}</p>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">{r.programName}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">
                        {r.progressPct}%{" "}
                        <span className="text-xs text-neutral-400">
                          ({r.completedModules}/{r.totalModules})
                        </span>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">
                        {r.avgPostTest != null ? `${r.avgPostTest}%` : "—"}
                      </td>
                      <td className="px-6 py-4 text-neutral-500 text-xs">
                        {r.graduationDate
                          ? new Date(r.graduationDate).toLocaleDateString("id-ID", { dateStyle: "medium" })
                          : "—"}
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
