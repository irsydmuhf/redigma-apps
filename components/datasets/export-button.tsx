"use client";

import { useState, useTransition } from "react";
import { Download, AlertCircle } from "lucide-react";
import { exportDatasetCsv } from "@/server-actions/datasets/export-dataset";

export function ExportButton({ datasetId }: { datasetId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const res = await exportDatasetCsv(datasetId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Trigger download via Blob
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = res.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (res.truncated) {
        alert(
          `Export sukses (${res.rowCount} baris).\n\n` +
            `Catatan: dataset ini punya lebih dari 5.000 baris — hanya 5.000 terbaru yang diexport. Untuk full export, pakai Supabase Dashboard.`
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {pending ? "Mengexport..." : "Export CSV"}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-700">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
