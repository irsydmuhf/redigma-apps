"use server";

import Papa from "papaparse";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EXPORT_LIMIT = 5000;

const SYSTEM_COLUMNS = new Set([
  "_id",
  "_import_job_id",
  "_imported_at",
  "_imported_by",
  "_source_file_url",
  "_deleted_at",
  "_row_hash",
  "_normalized_phone",
  "_normalized_email",
  "_normalized_sku",
  "_normalized_nik",
]);

export type ExportResult =
  | { ok: true; csv: string; fileName: string; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

export async function exportDatasetCsv(
  datasetId: string
): Promise<ExportResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const supabase = await createClient();

  // RLS-aware: kalau user tidak punya akses, query return nothing
  const { data: dataset } = await supabase
    .from("datasets")
    .select("id, physical_table_name, display_name")
    .eq("id", datasetId)
    .maybeSingle();

  if (!dataset) {
    return { ok: false, error: "Dataset tidak ditemukan atau tidak ada akses." };
  }

  const { data: columns } = await supabase
    .from("dataset_columns")
    .select("physical_column_name, display_name, position")
    .eq("dataset_id", datasetId)
    .order("position");

  if (!columns || columns.length === 0) {
    return { ok: false, error: "Dataset tidak punya kolom." };
  }

  // Pakai admin client untuk query data + paksa filter _deleted_at IS NULL
  // (admin bypass RLS — kita sudah validate access via RLS check di atas)
  const admin = createAdminClient();
  const { data: rows, error: rowsErr } = await admin
    .from(dataset.physical_table_name as string)
    .select("*")
    .is("_deleted_at", null)
    .order("_imported_at", { ascending: false })
    .limit(EXPORT_LIMIT + 1);

  if (rowsErr) {
    return { ok: false, error: `Gagal baca data: ${rowsErr.message}` };
  }

  const truncated = (rows?.length ?? 0) > EXPORT_LIMIT;
  const actualRows = (rows ?? []).slice(0, EXPORT_LIMIT);

  const userColumns = columns.filter(
    (c) => !SYSTEM_COLUMNS.has(c.physical_column_name as string)
  );

  // Build CSV: header pakai display_name (lebih ramah), value dari physical_name
  const headerRow = userColumns.map((c) => c.display_name as string);
  const dataRows = actualRows.map((row) =>
    userColumns.map((c) => {
      const v = (row as Record<string, unknown>)[c.physical_column_name as string];
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? "Ya" : "Tidak";
      return String(v);
    })
  );

  const csv = Papa.unparse({
    fields: headerRow,
    data: dataRows,
  });

  const safeName = String(dataset.display_name)
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  const fileName = `${safeName || "dataset"}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return {
    ok: true,
    csv,
    fileName,
    rowCount: actualRows.length,
    truncated,
  };
}
