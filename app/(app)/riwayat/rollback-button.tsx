"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { rollbackImport } from "@/server-actions/datasets/rollback-import";

export function RollbackButton({
  importJobId,
  datasetName,
  rowsAffected,
}: {
  importJobId: string;
  datasetName: string;
  rowsAffected: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle() {
    const msg = `Yakin rollback import ini?\n\n${rowsAffected.toLocaleString("id-ID")} baris dari dataset "${datasetName}" akan disembunyikan (soft delete). Bisa di-restore di halaman Trash dalam 30 hari.`;
    if (!confirm(msg)) return;

    startTransition(async () => {
      setError(null);
      const res = await rollbackImport(importJobId);
      if (!res.ok) {
        setError(res.error);
        alert(`Rollback gagal: ${res.error}`);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
      >
        <Undo2 className="h-3 w-3" />
        {pending ? "Rollback..." : "Rollback"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
