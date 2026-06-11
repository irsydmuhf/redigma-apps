"use client";

import { Trash2 } from "lucide-react";
import { deleteProgram } from "@/lib/lms/program-actions";

export function DeleteProgramButton({
  programId,
  programName,
}: {
  programId: string;
  programName: string;
}) {
  return (
    <form
      action={deleteProgram.bind(null, programId)}
      onSubmit={(e) => {
        const ok = confirm(
          `Hapus program "${programName}"?\n\n` +
            "Semua fase, modul, pendaftaran ADV, progress, dan sertifikat pada program ini akan ikut TERHAPUS PERMANEN dan tidak bisa dikembalikan."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <button
        type="submit"
        title="Hapus program"
        className="flex items-center gap-2 rounded-2xl border border-red-100 px-3 py-2.5 text-sm font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
