"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DedupMode } from "./append-to-dataset";

type ColumnToAdd = {
  physicalName: string;
  displayName: string;
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "phone" | "email";
  isUniqueKey?: boolean;
};

export type AppendLargeDatasetInput = {
  datasetId: string;
  addColumns: ColumnToAdd[];
  fileName: string;
  fileHash: string;
  rawFileUrl: string;
  estimatedRows: number;
  dedupMode: DedupMode;
  isBackfill?: boolean;
};

export type AppendLargeDatasetResult =
  | { ok: true; datasetId: string; importJobId: string }
  | { ok: false; error: string };

/**
 * Append flow untuk file besar: alter columns + create import_jobs (queued).
 * Insert baris dilakukan Edge Function di background.
 */
export async function appendLargeDataset(
  input: AppendLargeDatasetInput
): Promise<AppendLargeDatasetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const admin = createAdminClient();
  const serverClient = await createClient();

  const { data: dataset } = await serverClient
    .from("datasets")
    .select("id, physical_table_name, division_code")
    .eq("id", input.datasetId)
    .maybeSingle();

  if (!dataset) {
    return {
      ok: false,
      error: "Dataset tidak ditemukan atau Anda tidak punya akses.",
    };
  }

  const divisionCode = dataset.division_code as string;
  const allowed =
    user.isAdmin ||
    user.divisions.some(
      (d) =>
        d.divisionCode === divisionCode &&
        ["staff", "spv", "head"].includes(d.role)
    );
  if (!allowed) {
    return { ok: false, error: "Tidak punya akses." };
  }

  // ADD COLUMN untuk kolom baru
  for (const col of input.addColumns) {
    const { error } = await serverClient.rpc("alter_dynamic_table_add_column", {
      p_dataset_id: input.datasetId,
      p_physical_name: col.physicalName,
      p_display_name: col.displayName,
      p_data_type: col.dataType,
      p_is_unique_key: col.isUniqueKey ?? false,
    });
    if (error) {
      return {
        ok: false,
        error: `Gagal tambah kolom ${col.physicalName}: ${error.message}`,
      };
    }
  }

  const modeLabel = `append_${input.dedupMode}` as
    | "append_skip"
    | "append_update"
    | "append_insert";

  // Create import_jobs
  const { data: jobRow, error: jobErr } = await admin
    .from("import_jobs")
    .insert({
      dataset_id: input.datasetId,
      division_code: divisionCode,
      file_name: input.fileName,
      file_hash: input.fileHash,
      source_file_url: input.rawFileUrl,
      status: "queued",
      mode: modeLabel,
      total_rows: input.estimatedRows,
      is_backfill: input.isBackfill ?? false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    return {
      ok: false,
      error: `Gagal membuat import_jobs: ${jobErr?.message}`,
    };
  }

  revalidatePath("/datasets");
  revalidatePath(`/datasets/${input.datasetId}`);

  return {
    ok: true,
    datasetId: input.datasetId,
    importJobId: jobRow.id as string,
  };
}
