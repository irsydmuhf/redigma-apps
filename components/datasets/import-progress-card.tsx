"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type JobRow = {
  id: string;
  status: "queued" | "processing" | "done" | "failed";
  total_rows: number | null;
  rows_inserted: number | null;
  rows_skipped: number | null;
  rows_updated: number | null;
  error_summary: { error?: string } | null;
  completed_at: string | null;
  mode: string | null;
};

export function ImportProgressCard({
  importJobId,
  initialJob,
}: {
  importJobId: string;
  initialJob?: JobRow | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobRow | null>(initialJob ?? null);

  useEffect(() => {
    const supabase = createClient();

    // Initial fetch (kalau initialJob tidak dikirim)
    if (!initialJob) {
      supabase
        .from("import_jobs")
        .select(
          "id, status, total_rows, rows_inserted, rows_skipped, rows_updated, error_summary, completed_at, mode"
        )
        .eq("id", importJobId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setJob(data as JobRow);
        });
    }

    // Realtime subscribe
    const channel = supabase
      .channel(`import-job-${importJobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "import_jobs",
          filter: `id=eq.${importJobId}`,
        },
        (payload) => {
          setJob(payload.new as JobRow);
          if (payload.new.status === "done") {
            // Refresh dataset detail page setelah done supaya data muncul
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [importJobId, initialJob, router]);

  if (!job) {
    return (
      <div className="rounded-3xl border border-neutral-100 bg-white p-6">
        <p className="text-sm text-neutral-500">Memuat status import...</p>
      </div>
    );
  }

  const fmt = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString("id-ID");
  const total = job.total_rows ?? 0;
  const inserted = job.rows_inserted ?? 0;
  const skipped = job.rows_skipped ?? 0;
  const updated = job.rows_updated ?? 0;
  const processed = inserted + skipped + updated;
  const pct = total > 0 ? Math.min(100, (processed / total) * 100) : 0;

  if (job.status === "done") {
    return (
      <div className="mesh-soft rounded-3xl border border-green-300 p-7">
        <div className="flex items-start gap-4">
          <div className="mesh-green grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-neutral-900">
              Import selesai
            </h3>
            <p className="mt-1 text-sm text-neutral-700">
              {fmt(inserted)} baris baru, {fmt(skipped)} di-skip,{" "}
              {fmt(updated)} di-update.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="rounded-3xl border-2 border-red-300 bg-red-50 p-7">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-700" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-red-900">
              Import gagal
            </h3>
            <p className="mt-1 text-sm text-red-800">
              {job.error_summary?.error ?? "Error tidak diketahui."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // queued / processing
  const isQueued = job.status === "queued";

  return (
    <div className="rounded-3xl border border-blue-200 bg-white p-7">
      <div className="flex items-start gap-4">
        <div className="mesh-blue grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white">
          {isQueued ? (
            <Clock className="h-5 w-5" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-neutral-900">
            {isQueued
              ? "Antri untuk diproses..."
              : "Import sedang berjalan"}
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            {isQueued
              ? "Edge Function akan mulai memproses file Anda dalam beberapa detik."
              : `${fmt(processed)} dari ${fmt(total)} baris diproses.`}
          </p>

          {!isQueued && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="mesh-blue h-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {pct.toFixed(1)}% selesai
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-blue-500" />
              {fmt(inserted)} baris baru
            </span>
            {(skipped > 0 || updated > 0) && (
              <>
                <span>{fmt(skipped)} skipped</span>
                <span>{fmt(updated)} updated</span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
        💡 Anda boleh tutup tab atau navigate ke halaman lain — progress
        tersimpan di server.
      </p>
    </div>
  );
}
