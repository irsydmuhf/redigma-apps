import Link from "next/link";
import { Trash2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { TrashActions } from "./trash-actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("id-ID");
}

export default async function TrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("import_jobs")
    .select(
      "id, dataset_id, file_name, rows_inserted, rolled_back_at, created_at, datasets(display_name), user_profiles!rolled_back_by(email, full_name)"
    )
    .not("rolled_back_at", "is", null)
    .order("rolled_back_at", { ascending: false })
    .limit(100);

  const list = jobs ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Trash
        </h1>
        <p className="text-sm text-neutral-600">
          Data yang sudah di-rollback. Bisa di-restore kembali, atau permanent
          delete (admin only).
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-12 text-center">
          <div className="mesh-soft mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl">
            <Trash2 className="h-7 w-7 text-neutral-700" />
          </div>
          <p className="text-sm font-medium text-neutral-700">Trash kosong</p>
          <p className="mt-1 text-xs text-neutral-500">
            Belum ada import yang di-rollback.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((job) => {
            const ds = Array.isArray(job.datasets)
              ? job.datasets[0]
              : job.datasets;
            const by = Array.isArray(job.user_profiles)
              ? job.user_profiles[0]
              : job.user_profiles;
            return (
              <div
                key={job.id as string}
                className="rounded-3xl border border-amber-200 bg-amber-50/40 p-5"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="mesh-soft grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
                    <Trash2 className="h-5 w-5 text-amber-700" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/datasets/${job.dataset_id}`}
                        className="font-semibold text-neutral-900 hover:underline"
                      >
                        {(ds?.display_name as string) ?? "Dataset terhapus"}
                      </Link>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        <RotateCcw className="h-3 w-3" />
                        Rolled back
                      </span>
                    </div>

                    <p className="text-sm text-neutral-600">
                      📄 {(job.file_name as string) ?? "tanpa file"} ·{" "}
                      {formatNumber(job.rows_inserted as number)} baris
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>
                        👤 di-rollback oleh{" "}
                        {(by?.full_name as string) ?? (by?.email as string) ?? "—"}
                      </span>
                      <span>
                        📅 {formatDate(job.rolled_back_at as string)}
                      </span>
                    </div>
                  </div>

                  <TrashActions
                    importJobId={job.id as string}
                    datasetName={(ds?.display_name as string) ?? "?"}
                    rowsAffected={(job.rows_inserted as number) ?? 0}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
