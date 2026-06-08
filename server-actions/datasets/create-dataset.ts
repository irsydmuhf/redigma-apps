"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhysicalName } from "@/lib/schema/naming";

type ColumnInput = {
  physicalName: string;
  displayName: string;
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "phone" | "email";
  isUniqueKey?: boolean;
};

export type CreateDatasetInput = {
  displayName: string;
  description?: string;
  divisionCode: string;
  columns: ColumnInput[];
  rows: Record<string, unknown>[];
  // Phase 6: tracking metadata
  fileName?: string;
  fileHash?: string;
  rawFileUrl?: string;
  isBackfill?: boolean;
};

export type CreateDatasetResult =
  | {
      ok: true;
      datasetId: string;
      importJobId: string;
      rowCount: number;
      rowsInserted: number;
    }
  | { ok: false; error: string };

const BATCH_SIZE = 500;

export async function createDataset(
  input: CreateDatasetInput
): Promise<CreateDatasetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const allowed =
    user.isAdmin ||
    user.divisions.some(
      (d) =>
        d.divisionCode === input.divisionCode &&
        ["staff", "spv", "head"].includes(d.role)
    );
  if (!allowed) {
    return {
      ok: false,
      error: "Anda tidak punya akses untuk membuat dataset di divisi ini.",
    };
  }

  if (!input.displayName.trim()) {
    return { ok: false, error: "Nama dataset wajib diisi." };
  }
  if (input.columns.length === 0) {
    return { ok: false, error: "Minimal harus ada 1 kolom data." };
  }
  if (input.rows.length === 0) {
    return { ok: false, error: "Tidak ada baris data." };
  }

  const admin = createAdminClient();

  // Generate unique physical_table_name
  const baseName = normalizePhysicalName(input.displayName);
  let physicalName = baseName;
  let suffix = 2;
  while (true) {
    const { data: exists } = await admin
      .from("datasets")
      .select("id")
      .eq("physical_table_name", physicalName)
      .maybeSingle();
    if (!exists) break;
    physicalName = `${baseName}_${suffix}`;
    suffix++;
    if (suffix > 99) {
      return {
        ok: false,
        error: "Terlalu banyak konflik nama. Coba nama dataset yang berbeda.",
      };
    }
  }

  const { createClient: createServerClient } = await import(
    "@/lib/supabase/server"
  );
  const serverClient = await createServerClient();

  const rpcColumns = input.columns.map((c) => ({
    physical_name: c.physicalName,
    display_name: c.displayName,
    data_type: c.dataType,
    is_unique_key: c.isUniqueKey ?? false,
  }));

  // 1. CREATE TABLE
  const { data: datasetId, error: rpcErr } = await serverClient.rpc(
    "create_dynamic_table",
    {
      p_physical_name: physicalName,
      p_columns: rpcColumns,
      p_division_code: input.divisionCode,
      p_display_name: input.displayName.trim(),
      p_description: input.description?.trim() || null,
    }
  );

  if (rpcErr || !datasetId) {
    return {
      ok: false,
      error: rpcErr?.message ?? "Gagal membuat tabel dinamis.",
    };
  }

  // 2. Buat import_jobs row (status=processing)
  const { data: jobRow, error: jobErr } = await admin
    .from("import_jobs")
    .insert({
      dataset_id: datasetId,
      division_code: input.divisionCode,
      file_name: input.fileName ?? null,
      file_hash: input.fileHash ?? null,
      source_file_url: input.rawFileUrl ?? null,
      status: "processing",
      mode: "create",
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

  // 3. Inject system columns + insert
  const nowIso = new Date().toISOString();
  const enrichedRows = input.rows.map((r) => ({
    _id: crypto.randomUUID(),
    _imported_at: nowIso,
    _imported_by: user.id,
    _import_job_id: importJobId,
    ...r,
  }));

  for (let i = 0; i < enrichedRows.length; i += BATCH_SIZE) {
    const batch = enrichedRows.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await serverClient.rpc("insert_dynamic_rows", {
      p_physical_name: physicalName,
      p_rows: batch,
    });
    if (insertErr) {
      // Update job → failed
      await admin
        .from("import_jobs")
        .update({
          status: "failed",
          error_summary: { error: insertErr.message },
          completed_at: new Date().toISOString(),
        })
        .eq("id", importJobId);

      return {
        ok: false,
        error: `Tabel dibuat & job dibuat, tapi insert gagal: ${insertErr.message}`,
      };
    }
  }

  // 4. Update import_jobs → done
  await admin
    .from("import_jobs")
    .update({
      status: "done",
      rows_inserted: enrichedRows.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  revalidatePath("/datasets");
  revalidatePath("/dashboard");

  return {
    ok: true,
    datasetId: datasetId as string,
    importJobId,
    rowCount: enrichedRows.length,
    rowsInserted: enrichedRows.length,
  };
}
