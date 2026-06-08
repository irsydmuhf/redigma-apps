import Link from "next/link";
import { ChevronLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

export default async function CrmSyncLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: logs } = await admin
    .from("crm_sync_log")
    .select(
      "id, dataset_id, target_table, mode, status, rows_processed, rows_inserted, rows_updated, rows_skipped, error_summary, duration_ms, run_at, datasets(display_name), user_profiles!run_by(email)"
    )
    .order("run_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/crm-sync"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke CRM Sync
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Log Sync CRM
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Riwayat 100 sync terakhir (auto + manual + rebuild).
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
        {(logs ?? []).length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-neutral-500">
            Belum ada log sync.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {(logs ?? []).map((log) => {
              const ds = Array.isArray(log.datasets) ? log.datasets[0] : log.datasets;
              const up = Array.isArray(log.user_profiles) ? log.user_profiles[0] : log.user_profiles;
              const isSuccess = log.status === "success";
              return (
                <div
                  key={log.id as string}
                  className="flex flex-wrap items-start gap-4 px-6 py-4"
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                      isSuccess
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <AlertCircle className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-900">
                      {(ds?.display_name as string) ?? "Dataset terhapus"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Mode: <code>{log.mode as string}</code> ·{" "}
                      {new Date(log.run_at as string).toLocaleString("id-ID")}
                      {up?.email && ` · ${up.email as string}`}
                      {log.duration_ms && ` · ${log.duration_ms} ms`}
                    </p>
                    {isSuccess ? (
                      <p className="mt-1 text-sm text-neutral-700">
                        {(log.rows_inserted ?? 0).toLocaleString("id-ID")} insert ·{" "}
                        {(log.rows_updated ?? 0).toLocaleString("id-ID")} update ·{" "}
                        {(log.rows_skipped ?? 0).toLocaleString("id-ID")} skip
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-700">
                        Error:{" "}
                        {(log.error_summary as { error?: string } | null)?.error ??
                          "unknown"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
