"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePhysicalName } from "@/lib/schema/naming";

type ColumnInput = {
  physicalName: string;
  displayName: string;
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "phone" | "email";
  isUniqueKey?: boolean;
};

export type CreateLargeDatasetInput = {
  displayName: string;
  description?: string;
  divisionCode: string;
  columns: ColumnInput[];
  // File metadata — tidak ada rows (Edge function akan baca dari Storage)
  fileName: string;
  fileHash: string;
  rawFileUrl: string;
  estimatedRows: number;
  isBackfill?: boolean;
};

export type CreateLargeDatasetResult =
  | { ok: true; datasetId: string; importJobId: string }
  | { ok: false; error: string };

/**
 * Create dataset metadata + import_jobs (queued) untuk file besar.
 * Tidak insert baris — itu kerja Edge Function process-import.
 */
export async function createLargeDataset(
  input: CreateLargeDatasetInput
): Promise<CreateLargeDatasetResult> {
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
    return { ok: false, error: "Anda tidak punya akses untuk divisi ini." };
  }

  if (!input.displayName.trim()) {
    return { ok: false, error: "Nama dataset wajib diisi." };
  }
  if (input.columns.length === 0) {
    return { ok: false, error: "Minimal harus ada 1 kolom data." };
  }

  const admin = createAdminClient();
  const serverClient = await createClient();

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
      return { ok: false, error: "Terlalu banyak konflik nama." };
    }
  }

  const rpcColumns = input.columns.map((c) => ({
    physical_name: c.physicalName,
    display_name: c.displayName,
    data_type: c.dataType,
    is_unique_key: c.isUniqueKey ?? false,
  }));

  // CREATE TABLE
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

  // Create import_jobs (status=queued)
  const { data: jobRow, error: jobErr } = await admin
    .from("import_jobs")
    .insert({
      dataset_id: datasetId,
      division_code: input.divisionCode,
      file_name: input.fileName,
      file_hash: input.fileHash,
      source_file_url: input.rawFileUrl,
      status: "queued",
      mode: "create",
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

  return {
    ok: true,
    datasetId: datasetId as string,
    importJobId: jobRow.id as string,
  };
}
