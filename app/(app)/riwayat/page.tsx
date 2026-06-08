import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  FileText,
  Undo2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { RollbackButton } from "./rollback-button";

const STATUS_BADGE: Record<
  string,
  { label: string; bg: string; text: string; icon: typeof Clock }
> = {
  queued: { label: "Antri", bg: "bg-neutral-100", text: "text-neutral-700", icon: Clock },
  processing: { label: "Diproses", bg: "bg-blue-100", text: "text-blue-700", icon: Loader2 },
  done: { label: "Selesai", bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2 },
  failed: { label: "Gagal", bg: "bg-red-100", text: "text-red-700", icon: AlertCircle },
};

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

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  let query = supabase
    .from("import_jobs")
    .select(
      "id, dataset_id, division_code, file_name, status, mode, total_rows, rows_inserted, rows_skipped, rows_updated, rolled_back_at, is_backfill, created_at, created_by, completed_at, datasets(display_name, physical_table_name), user_profiles!created_by(email, full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    if (status === "rolled_back") {
      query = query.not("rolled_back_at", "is", null);
    } else {
      query = query.eq("status", status);
    }
  }

  const { data: jobs } = await query;
  const list = jobs ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Riwayat Import
        </h1>
        <p className="text-sm text-neutral-600">
          Semua import yang pernah Anda atau tim Anda lakukan.
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "Semua" },
          { value: "done", label: "Selesai" },
          { value: "processing", label: "Diproses" },
          { value: "queued", label: "Antri" },
          { value: "failed", label: "Gagal" },
          { value: "rolled_back", label: "Di-rollback" },
        ].map((opt) => {
          const active = (status ?? "all") === opt.value;
          return (
            <Link
              key={opt.value}
              href={`/riwayat${opt.value === "all" ? "" : `?status=${opt.value}`}`}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? "mesh-blue text-white shadow"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-12 text-center">
          <div className="mesh-soft mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl">
            <History className="h-7 w-7 text-neutral-700" />
          </div>
          <p className="text-sm font-medium text-neutral-700">
            Belum ada import
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Upload file CSV pertama untuk mulai.
          </p>
          <Link
            href="/upload"
            className="mesh-blue mt-4 inline-flex items-center gap-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white"
          >
            Upload CSV
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((job) => {
            const ds = Array.isArray(job.datasets)
              ? job.datasets[0]
              : job.datasets;
            const up = Array.isArray(job.user_profiles)
              ? job.user_profiles[0]
              : job.user_profiles;
            const badge = STATUS_BADGE[job.status as string] ?? STATUS_BADGE.queued;
            const Icon = badge.icon;
            const isRolledBack = job.rolled_back_at !== null;
            const isOwner = job.created_by === user.id;

            return (
              <div
                key={job.id as string}
                className={`rounded-3xl border bg-white p-5 ${
                  isRolledBack
                    ? "border-amber-200 opacity-75"
                    : "border-neutral-100"
                }`}
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="mesh-soft grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
                    <FileText className="h-5 w-5 text-neutral-700" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/datasets/${job.dataset_id}`}
                        className="font-semibold text-neutral-900 hover:underline"
                      >
                        {(ds?.display_name as string) ?? "Dataset terhapus"}
                      </Link>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        <Icon
                          className={`h-3 w-3 ${job.status === "processing" ? "animate-spin" : ""}`}
                        />
                        {badge.label}
                      </span>
                      {isRolledBack && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          <Undo2 className="h-3 w-3" />
                          Rolled back
                        </span>
                      )}
                      {job.is_backfill && (
                        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          Backfill
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-neutral-600">
                      📄 {(job.file_name as string) ?? "tanpa file"}
                      {" · "}
                      Mode: <code className="text-xs">{(job.mode as string) ?? "create"}</code>
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>
                        👤 {(up?.full_name as string) ?? (up?.email as string) ?? "—"}
                      </span>
                      <span>📅 {formatDate(job.created_at as string)}</span>
                      <span>
                        ✅ {formatNumber(job.rows_inserted as number)} baris
                        {(job.rows_skipped ?? 0) > 0 && (
                          <> · ⏭️ {formatNumber(job.rows_skipped as number)} skipped</>
                        )}
                        {(job.rows_updated ?? 0) > 0 && (
                          <> · 🔄 {formatNumber(job.rows_updated as number)} updated</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Aksi */}
                  {job.status === "done" &&
                    !isRolledBack &&
                    (user.isAdmin || isOwner || user.divisions.some(
                      (d) =>
                        d.divisionCode === job.division_code &&
                        ["spv", "head"].includes(d.role)
                    )) && (
                      <RollbackButton
                        importJobId={job.id as string}
                        datasetName={(ds?.display_name as string) ?? "?"}
                        rowsAffected={(job.rows_inserted as number) ?? 0}
                      />
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
