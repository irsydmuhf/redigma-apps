import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectColumnType, type DataType } from "./detect";
import { normalizePhysicalName, uniquePhysicalName } from "../schema/naming";

export type ParsedColumn = {
  displayName: string;
  physicalName: string;
  dataType: DataType;
};

export type ParsedCsv = {
  columns: ParsedColumn[];
  rows: Record<string, string>[];
  rowCount: number;
};

const SAMPLE_SIZE = 200;

function buildColumns(
  headers: string[],
  rows: Record<string, string>[]
): ParsedColumn[] {
  const usedNames = new Set<string>();
  return headers.map((h) => {
    const physicalName = uniquePhysicalName(h, usedNames);
    usedNames.add(physicalName);
    const samples = rows
      .slice(0, SAMPLE_SIZE)
      .map((r) => String(r[h] ?? ""));
    const dataType = detectColumnType(samples);
    return { displayName: h, physicalName, dataType };
  });
}

/**
 * Dispatcher: pilih parser sesuai ekstensi file.
 */
export function parseSpreadsheetFile(file: File): Promise<ParsedCsv> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseCsvFile(file);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) {
    return parseExcelFile(file);
  }
  return Promise.reject(
    new Error(
      "Format file tidak didukung. Gunakan .csv, .xlsx, .xls, atau .xlsm."
    )
  );
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        if (result.errors.length > 0) {
          const fatal = result.errors.find((e) => e.type === "Quotes");
          if (fatal) {
            reject(new Error(`CSV tidak valid: ${fatal.message}`));
            return;
          }
        }

        const rows = result.data.filter((r) =>
          Object.values(r).some((v) => v && String(v).trim() !== "")
        );

        if (rows.length === 0) {
          reject(new Error("File kosong atau tidak ada baris data."));
          return;
        }

        const headers = result.meta.fields ?? [];
        if (headers.length === 0) {
          reject(new Error("File tidak punya header kolom."));
          return;
        }

        resolve({
          columns: buildColumns(headers, rows),
          rows,
          rowCount: rows.length,
        });
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseExcelFile(file: File): Promise<ParsedCsv> {
  const buffer = await file.arrayBuffer();
  // cellText: true + cellNF: true memastikan SheetJS menyimpan formatted text (cell.w)
  // dari Excel apa adanya — terutama penting untuk nomor telepon panjang
  // yang kalau dibaca raw akan kena precision loss (digit akhir jadi 0).
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellNF: true,
    cellText: true,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File Excel tidak punya sheet.");
  }
  const sheet = workbook.Sheets[firstSheetName];

  // Manual scan supaya bisa pakai cell.w (formatted) untuk semua cell
  // kalau ada — fallback ke cell.v (raw) kalau tidak.
  // Ini key untuk fix bug "nomor telepon panjang jadi semua 0 di akhir".
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const aoa: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    let hasAny = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) {
        row.push("");
        continue;
      }
      // Prefer formatted text (cell.w) untuk angka panjang seperti phone.
      // Untuk type 'n' (number) yang besar, cell.w = display string Excel
      // yang preserve full digits-nya. Untuk type 's' (string), pakai .v.
      let value: unknown;
      if (cell.t === "n" && typeof cell.v === "number") {
        // Excel render angka panjang sebagai scientific ("6,28E+12") di cell.w
        // kalau format General + kolom sempit. Untuk integer kayak nomor HP,
        // rekonstruksi dari cell.v (JS baru pakai scientific kalau ≥ 1e21,
        // jadi 13-digit phone aman jadi "6285389060410").
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
        // Date: format ke ISO
        value = (cell.v as Date).toISOString().slice(0, 10);
      } else {
        // String, boolean, dll: pakai raw value
        value = cell.v ?? cell.w ?? "";
      }
      row.push(value);
      if (value !== "" && value !== null && value !== undefined) hasAny = true;
    }
    if (r === range.s.r || hasAny) aoa.push(row); // header always, then non-empty rows
  }

  if (aoa.length === 0) {
    throw new Error("File Excel kosong.");
  }
  if (aoa.length < 2) {
    throw new Error(
      "File Excel hanya punya header — tidak ada baris data."
    );
  }

  // Normalisasi header (trim, fallback kalau kosong)
  const rawHeaders = aoa[0] ?? [];
  const headers: string[] = rawHeaders.map((h, i) => {
    const s = String(h ?? "").trim();
    return s || `kolom_${i + 1}`;
  });

  // Build rows sebagai Record<header, value as string>
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

  if (rows.length === 0) {
    throw new Error("File Excel tidak ada baris data setelah header.");
  }

  return {
    columns: buildColumns(headers, rows),
    rows,
    rowCount: rows.length,
  };
}

/**
 * Konversi rows ke records siap insert (key = physicalName, value coerced).
 */
export function buildInsertRecords(
  rows: Record<string, string>[],
  columns: ParsedColumn[],
  coerce: (raw: string, type: DataType) => unknown
): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      out[c.physicalName] = coerce(String(r[c.displayName] ?? ""), c.dataType);
    }
    return out;
  });
}

export { normalizePhysicalName };
