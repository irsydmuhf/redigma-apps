"use client";

import { useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  restoreImport,
  permanentDeleteImport,
} from "@/server-actions/datasets/rollback-import";

export function TrashActions({
  importJobId,
  datasetName,
  rowsAffected,
}: {
  importJobId: string;
  datasetName: string;
  rowsAffected: number;
}) {
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    const msg = `Restore ${rowsAffected.toLocaleString("id-ID")} baris ke dataset "${datasetName}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await restoreImport(importJobId);
      if (!res.ok) alert(`Restore gagal: ${res.error}`);
    });
  }

  function handlePermanentDelete() {
    const msg = `PERMANENT DELETE ${rowsAffected.toLocaleString("id-ID")} baris dari "${datasetName}"?\n\nAksi ini TIDAK BISA di-undo. Yakin?`;
    if (!confirm(msg)) return;
    if (!confirm("Sekali lagi: ini permanent delete, tidak bisa di-undo. Lanjut?")) return;
    startTransition(async () => {
      const res = await permanentDeleteImport(importJobId);
      if (!res.ok) alert(`Delete gagal: ${res.error}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleRestore}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        Restore
      </button>
      <button
        type="button"
        onClick={handlePermanentDelete}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
      >
        <Trash2 className="h-3 w-3" />
        Permanent Delete
      </button>
    </div>
  );
}
