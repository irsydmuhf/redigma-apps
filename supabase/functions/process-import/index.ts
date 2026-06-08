// Supabase Edge Function: process-import
// =====================================================================
// Background processing untuk file besar (≥5MB).
// Dipanggil dari server action setelah dataset + import_jobs ter-create
// dan raw file ter-upload ke Storage.
//
// Flow:
// 1. Fetch import_jobs + dataset metadata + dataset_columns
// 2. Download raw file dari Storage bucket raw-imports
// 3. Parse CSV (Papa) atau XLSX (SheetJS)
// 4. Coerce nilai per kolom sesuai schema
// 5. Insert batch via RPC insert_dynamic_rows (atau dedup version)
// 6. Update import_jobs.rows_inserted setiap batch
// 7. Final status = done atau failed
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import Papa from "https://esm.sh/papaparse@5.5.3";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { coerceValue, detectConvention, type DataType } from "./coerce.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 5; // update import_jobs setiap N batch

type ColumnMeta = {
  physical_column_name: string;
  display_name: string;
  data_type: DataType;
  is_unique_key: boolean;
};

type ImportJob = {
  id: string;
  dataset_id: string;
  source_file_url: string | null;
  mode: string | null;
  created_by: string;
  total_rows: number;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload: { importJobId?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (!payload.importJobId) {
    return jsonResponse({ ok: false, error: "Missing importJobId" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const jobId = payload.importJobId;

  // 1. Fetch job + dataset + columns
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .select(
      "id, dataset_id, source_file_url, mode, created_by, total_rows, datasets ( physical_table_name )"
    )
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return jsonResponse(
      { ok: false, error: `Job not found: ${jobErr?.message}` },
      404
    );
  }

  // deno-lint-ignore no-explicit-any
  const ds = Array.isArray((job as any).datasets)
    ? // deno-lint-ignore no-explicit-any
      (job as any).datasets[0]
    : // deno-lint-ignore no-explicit-any
      (job as any).datasets;
  const physicalName = ds?.physical_table_name as string | undefined;

  if (!physicalName) {
    return await markFailed(supabase, jobId, "Dataset metadata tidak lengkap");
  }

  await supabase
    .from("import_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);

  const { data: cols, error: colsErr } = await supabase
    .from("dataset_columns")
    .select("physical_column_name, display_name, data_type, is_unique_key")
    .eq("dataset_id", (job as ImportJob).dataset_id)
    .order("position");

  if (colsErr || !cols) {
    return await markFailed(
      supabase,
      jobId,
      `Gagal load columns: ${colsErr?.message}`
    );
  }

  // 2. Download raw file
  if (!(job as ImportJob).source_file_url) {
    return await markFailed(supabase, jobId, "Tidak ada source_file_url");
  }

  const { data: fileData, error: dlErr } = await supabase.storage
    .from("raw-imports")
    .download((job as ImportJob).source_file_url!);

  if (dlErr || !fileData) {
    return await markFailed(
      supabase,
      jobId,
      `Gagal download file: ${dlErr?.message}`
    );
  }

  // 3. Parse file
  let parsedRows: Record<string, string>[];
  let headers: string[];
  try {
    const result = await parseFile(
      fileData,
      (job as ImportJob).source_file_url!
    );
    parsedRows = result.rows;
    headers = result.headers;
  } catch (e) {
    return await markFailed(
      supabase,
      jobId,
      `Parse error: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (parsedRows.length === 0) {
    return await markFailed(supabase, jobId, "File tidak punya baris data");
  }

  // 4. Build records sesuai schema dari dataset_columns
  // Mapping: display_name → physical_column_name + data_type
  const columnMap = new Map<string, ColumnMeta>();
  for (const c of cols as ColumnMeta[]) {
    columnMap.set(c.display_name, c);
  }

  // Fallback matching: kalau display name CSV tidak persis sama, coba physical_name
  function findCol(header: string): ColumnMeta | undefined {
    return (
      columnMap.get(header) ??
      (cols as ColumnMeta[]).find(
        (c) => c.physical_column_name === header.toLowerCase()
      )
    );
  }

  const nowIso = new Date().toISOString();
  const uniqueCols = (cols as ColumnMeta[])
    .filter((c) => c.is_unique_key)
    .map((c) => c.physical_column_name);

  const records: Record<string, unknown>[] = [];
  for (const row of parsedRows) {
    const rec: Record<string, unknown> = {
      _id: crypto.randomUUID(),
      _imported_at: nowIso,
      _imported_by: (job as ImportJob).created_by,
      _import_job_id: jobId,
    };

    for (const header of headers) {
      const col = findCol(header);
      if (!col) continue;
      const raw = String(row[header] ?? "");
      const val = coerceValue(raw, col.data_type);
      rec[col.physical_column_name] = val;

      // Convention soft-link
      const conv = detectConvention(col.display_name);
      if (conv && val !== null && val !== undefined) {
        rec[`_normalized_${conv}`] = String(val);
      }
    }

    // Row hash
    if (uniqueCols.length > 0) {
      const parts = uniqueCols.map((c) => {
        const v = rec[c];
        return v === null || v === undefined ? "" : String(v).trim().toLowerCase();
      });
      if (parts.some((p) => p !== "")) {
        rec._row_hash = parts.join("||");
      }
    }

    records.push(rec);
  }

  // 5. Insert batches
  const useDedup =
    (job as ImportJob).mode === "append_skip" ||
    (job as ImportJob).mode === "append_update" ||
    (job as ImportJob).mode === "append_insert";
  const dedupMode = (job as ImportJob).mode?.replace("append_", "") ?? "skip";

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;
  let batchCount = 0;

  // Update total_rows (kalau total dari client beda dengan actual)
  await supabase
    .from("import_jobs")
    .update({ total_rows: records.length })
    .eq("id", jobId);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    if (useDedup) {
      const { data, error } = await supabase.rpc(
        "insert_dynamic_rows_with_dedup",
        {
          p_physical_name: physicalName,
          p_rows: batch,
          p_mode: dedupMode,
          p_import_job_id: jobId,
        }
      );
      if (error) {
        return await markFailed(supabase, jobId, error.message);
      }
      // deno-lint-ignore no-explicit-any
      const sum = data as any;
      totalInserted += sum?.inserted ?? 0;
      totalSkipped += sum?.skipped ?? 0;
      totalUpdated += sum?.updated ?? 0;
    } else {
      const { error } = await supabase.rpc("insert_dynamic_rows", {
        p_physical_name: physicalName,
        p_rows: batch,
      });
      if (error) {
        return await markFailed(supabase, jobId, error.message);
      }
      totalInserted += batch.length;
    }

    batchCount++;
    if (batchCount % PROGRESS_INTERVAL === 0 || i + BATCH_SIZE >= records.length) {
      await supabase
        .from("import_jobs")
        .update({
          rows_inserted: totalInserted,
          rows_skipped: totalSkipped,
          rows_updated: totalUpdated,
        })
        .eq("id", jobId);
    }
  }

  // 6. Mark done
  await supabase
    .from("import_jobs")
    .update({
      status: "done",
      rows_inserted: totalInserted,
      rows_skipped: totalSkipped,
      rows_updated: totalUpdated,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return jsonResponse({
    ok: true,
    rowsInserted: totalInserted,
    rowsSkipped: totalSkipped,
    rowsUpdated: totalUpdated,
  });
});

// =====================================================================
// Helpers
// =====================================================================

async function parseFile(
  blob: Blob,
  filePath: string
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".xlsx") || lowerPath.endsWith(".xls") || lowerPath.endsWith(".xlsm")) {
    const buffer = await blob.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellNF: true,
      cellText: true,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("Excel tidak punya sheet");
    const sheet = workbook.Sheets[sheetName];

    // Manual scan: pakai cell.w (formatted text) untuk number type
    // supaya nomor telepon panjang tidak kena precision loss.
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const aoa: unknown[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: unknown[] = [];
      let hasAny = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        // deno-lint-ignore no-explicit-any
        const cell = (sheet as any)[addr];
        if (!cell) {
          row.push("");
          continue;
        }
        let value: unknown;
        if (cell.t === "n" && typeof cell.v === "number") {
          // cell.w sering scientific ("6,28E+12") untuk integer panjang.
          // Rekonstruksi dari cell.v supaya digit nomor HP utuh.
          const wLooksScientific =
            typeof cell.w === "string" && /[eE]/.test(cell.w);
          if (Number.isInteger(cell.v) && wLooksScientific) {
            value = cell.v.toString();
          } else if (typeof cell.w === "string") {
            value = cell.w;
          } else {
            value = String(cell.v);
          }
        } else if (cell.t === "d" && cell.v instanceof Date) {
          value = (cell.v as Date).toISOString().slice(0, 10);
        } else {
          value = cell.v ?? cell.w ?? "";
        }
        row.push(value);
        if (value !== "" && value !== null && value !== undefined) hasAny = true;
      }
      if (r === range.s.r || hasAny) aoa.push(row);
    }

    if (aoa.length < 2) throw new Error("Excel tidak punya baris data");

    const headers = (aoa[0] ?? []).map((h, i) => {
      const s = String(h ?? "").trim();
      return s || `kolom_${i + 1}`;
    });

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i] ?? [];
      const record: Record<string, string> = {};
      let hasValue = false;
      for (let j = 0; j < headers.length; j++) {
        const v = row[j];
        const s = v === null || v === undefined ? "" : String(v);
        record[headers[j]] = s;
        if (s.trim() !== "") hasValue = true;
      }
      if (hasValue) rows.push(record);
    }
    return { headers, rows };
  }

  // CSV / TSV / TXT
  const text = await blob.text();
  // deno-lint-ignore no-explicit-any
  const result = (Papa as any).parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    // deno-lint-ignore no-explicit-any
    transformHeader: (h: any) => String(h).trim(),
  });
  const rows = result.data.filter((r: Record<string, string>) =>
    Object.values(r).some((v) => v && String(v).trim() !== "")
  );
  const headers = result.meta?.fields ?? [];
  return { headers: headers as string[], rows };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status,
  });
}

// deno-lint-ignore no-explicit-any
async function markFailed(supabase: any, jobId: string, msg: string) {
  await supabase
    .from("import_jobs")
    .update({
      status: "failed",
      error_summary: { error: msg },
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  return jsonResponse({ ok: false, error: msg }, 500);
}
