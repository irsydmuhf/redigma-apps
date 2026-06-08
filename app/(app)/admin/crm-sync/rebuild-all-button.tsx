"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { rebuildAllCrm } from "@/server-actions/crm-sync/sync-actions";

export function RebuildAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle() {
    if (
      !confirm(
        "Rebuild SEMUA data CRM dari awal?\n\nIni akan re-process semua dataset yang punya mapping aktif. Bisa lama (beberapa menit) tergantung ukuran data. Lanjut?"
      )
    )
      return;

    startTransition(async () => {
      const res = await rebuildAllCrm();
      if (!res.ok) {
        alert(`Rebuild gagal: ${res.error}`);
        return;
      }
      alert("Rebuild selesai. Cek log untuk detail.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="mesh-purple inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Rebuilding..." : "Rebuild All"}
    </button>
  );
}
