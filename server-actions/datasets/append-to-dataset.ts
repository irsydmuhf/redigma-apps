"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ColumnToAdd = {
  physicalName: string;
  displayName: string;
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "phone" | "email";
  isUniqueKey?: boolean;
};

export type DedupMode = "skip" | "update" | "insert";

export type AppendToDatasetInput = {
  datasetId: string;
  addColumns: ColumnToAdd[];
  rows: Record<string, unknown>[];
  // Phase 6
  fileName?: string;
  fileHash?: string;
  rawFileUrl?: string;
  isBackfill?: boolean;
  dedupMode: DedupMode;
};

export type AppendResult =
  | {
      ok: true;
      datasetId: string;
      importJobId: string;
      rowsInserted: number;
      rowsSkipped: number;
      rowsUpdated: number;
      columnsAdded: number;
    }
  | { ok: false; error: string };

const BATCH_SIZE = 500;

export async function appendToDataset(
  input: AppendToDatasetInput
): Promise<AppendResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  if (input.rows.length === 0) {
    return { ok: false, error: "Tidak ada baris untuk di-append." };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Get dataset
  const { data: dataset } = await supabase
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
    return { ok: false, error: "Anda tidak punya akses untuk append." };
  }

  const physicalTableName = dataset.physical_table_name as string;
  const modeLabel = `append_${input.dedupMode}` as
    | "append_skip"
    | "append_update"
    | "append_insert";

  // 1. ADD COLUMN untuk setiap kolom baru
  for (const col of input.addColumns) {
    const { error } = await supabase.rpc("alter_dynamic_table_add_column", {
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

  // 2. Buat import_jobs row
  const { data: jobRow, error: jobErr } = await admin
    .from("import_jobs")
    .insert({
      dataset_id: input.datasetId,
      division_code: divisionCode,
      file_name: input.fileName ?? null,
      file_hash: input.fileHash ?? null,
      source_file_url: input.rawFileUrl ?? null,
      status: "processing",
      mode: modeLabel,
      total_rows: input.rows.length,
      is_backfill: input.isBackfill ?? false,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    return {
      ok: false,
      error: `Gagal membuat import_jobs: ${jobErr?.message ?? "unknown"}`,
    };
  }

  const importJobId = jobRow.id as string;

  // 3. Inject system columns + insert via dedup RPC
  const nowIso = new Date().toISOString();
  const enrichedRows = input.rows.map((r) => ({
    _id: crypto.randomUUID(),
    _imported_at: nowIso,
    _imported_by: user.id,
    _import_job_id: importJobId,
    ...r,
  }));

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;

  for (let i = 0; i < enrichedRows.length; i += BATCH_SIZE) {
    const batch = enrichedRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.rpc(
      "insert_dynamic_rows_with_dedup",
      {
        p_physical_name: physicalTableName,
        p_rows: batch,
        p_mode: input.dedupMode,
        p_import_job_id: importJobId,
      }
    );
    if (error) {
      await admin
        .from("import_jobs")
        .update({
          status: "failed",
          error_summary: { error: error.message },
          completed_at: new Date().toISOString(),
        })
        .eq("id", importJobId);
      return {
        ok: false,
        error: `Insert gagal: ${error.message}`,
      };
    }
    const summary = data as {
      inserted: number;
      skipped: number;
      updated: number;
    };
    totalInserted += summary.inserted ?? 0;
    totalSkipped += summary.skipped ?? 0;
    totalUpdated += summary.updated ?? 0;
  }

  // 4. Update import_jobs
  await admin
    .from("import_jobs")
    .update({
      status: "done",
      rows_inserted: totalInserted,
      rows_skipped: totalSkipped,
      rows_updated: totalUpdated,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  // 5. Audit log schema_changelog
  await admin.from("schema_changelog").insert({
    dataset_id: input.datasetId,
    change_type: "append_data",
    change_detail: {
      import_job_id: importJobId,
      row_count: totalInserted + totalUpdated,
      skipped: totalSkipped,
      mode: input.dedupMode,
      columns_added: input.addColumns.map((c) => c.physicalName),
    },
    changed_by: user.id,
  });

  revalidatePath("/datasets");
  revalidatePath(`/datasets/${input.datasetId}`);
  revalidatePath("/dashboard");

  return {
    ok: true,
    datasetId: input.datasetId,
    importJobId,
    rowsInserted: totalInserted,
    rowsSkipped: totalSkipped,
    rowsUpdated: totalUpdated,
    columnsAdded: input.addColumns.length,
  };
}
