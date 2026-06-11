"use client";

import { Trash2 } from "lucide-react";
import { deleteProgram } from "@/lib/lms/program-actions";
import { ConfirmButton } from "@/components/ui/confirm-button";

export function DeleteProgramButton({
  programId,
  programName,
}: {
  programId: string;
  programName: string;
}) {
  return (
    <ConfirmButton
      action={deleteProgram.bind(null, programId)}
      triggerTitle="Hapus program"
      className="flex items-center gap-2 rounded-2xl border border-red-100 px-3 py-2.5 text-sm font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50"
      title={`Hapus program "${programName}"?`}
      description="Semua fase, modul, pendaftaran ADV, progress, dan sertifikat pada program ini akan terhapus permanen dan tidak bisa dikembalikan."
      confirmLabel="Hapus Program"
    >
      <Trash2 className="h-4 w-4" />
    </ConfirmButton>
  );
}
