import { coerceValue, type DataType } from "./detect";

export type CellStatus = "ok" | "normalized" | "error" | "empty";

export type NormalizedCell = {
  raw: string;
  value: unknown; // null kalau empty, undefined kalau error, lainnya = normalized value
  status: CellStatus;
};

export type ColumnSpec = {
  displayName: string;
  physicalName: string;
  dataType: DataType;
};

/**
 * Hitung status untuk 1 sel.
 * - empty: input kosong → null (legal, jadi NULL di DB)
 * - error: tidak bisa di-parse jadi tipe target
 * - normalized: hasil parse berbeda dari raw (misal "01/06/2026" → "2026-06-01")
 * - ok: hasil parse identik dengan raw
 */
export function normalizeCell(raw: string, type: DataType): NormalizedCell {
  const trimmed = (raw ?? "").toString().trim();

  if (trimmed === "") {
    return { raw: "", value: null, status: "empty" };
  }

  const value = coerceValue(trimmed, type);

  if (value === undefined) {
    return { raw: trimmed, value: undefined, status: "error" };
  }

  if (value === null) {
    return { raw: trimmed, value: null, status: "empty" };
  }

  // Cek apakah value berubah dari raw
  const valueStr = String(value);
  const status: CellStatus = valueStr === trimmed ? "ok" : "normalized";

  return { raw: trimmed, value, status };
}

/**
 * Compute grid normalisasi untuk semua baris × semua kolom.
 * Return: array of rows, each row = Record<physicalName, NormalizedCell>
 */
export function buildNormalizedGrid(
  rows: Record<string, string>[],
  columns: ColumnSpec[]
): Record<string, NormalizedCell>[] {
  return rows.map((row) => {
    const out: Record<string, NormalizedCell> = {};
    for (const col of columns) {
      const raw = String(row[col.displayName] ?? "");
      out[col.physicalName] = normalizeCell(raw, col.dataType);
    }
    return out;
  });
}

/**
 * Hitung jumlah error per baris.
 */
export function countErrorsPerRow(
  grid: Record<string, NormalizedCell>[]
): number[] {
  return grid.map((row) =>
    Object.values(row).filter((c) => c.status === "error").length
  );
}

/**
 * Apakah baris ini punya error (tidak boleh di-import sebelum di-fix / di-skip)?
 */
export function rowHasError(row: Record<string, NormalizedCell>): boolean {
  return Object.values(row).some((c) => c.status === "error");
}

export type GridStats = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  cellNormalized: number;
  cellError: number;
};

export function computeGridStats(
  grid: Record<string, NormalizedCell>[],
  skipped: Set<number>
): GridStats {
  let validRows = 0;
  let errorRows = 0;
  let cellNormalized = 0;
  let cellError = 0;

  grid.forEach((row, i) => {
    let hasError = false;
    for (const cell of Object.values(row)) {
      if (cell.status === "normalized") cellNormalized++;
      if (cell.status === "error") {
        cellError++;
        hasError = true;
      }
    }
    if (skipped.has(i)) return;
    if (hasError) errorRows++;
    else validRows++;
  });

  return {
    totalRows: grid.length,
    validRows,
    errorRows,
    skippedRows: skipped.size,
    cellNormalized,
    cellError,
  };
}
