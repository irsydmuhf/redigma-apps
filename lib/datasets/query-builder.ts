/**
 * Query builder helper untuk dataset dinamis.
 * Pakai Supabase JS builder chain — aman dari SQL injection.
 */

import type { SortCriterion } from "./url-state";

const SAFE_IDENT_REGEX = /^[a-z_][a-z0-9_]*$/;
const SEARCHABLE_TYPES = new Set(["text", "email", "phone", "currency"]);

export type SearchableColumn = {
  physical_column_name: string;
  data_type: string;
};

export function isSafeIdent(name: string): boolean {
  return SAFE_IDENT_REGEX.test(name);
}

/**
 * Filter searchable columns by data_type.
 */
export function getSearchableColumns(
  columns: SearchableColumn[]
): SearchableColumn[] {
  return columns.filter((c) => SEARCHABLE_TYPES.has(c.data_type));
}

/**
 * Bangun string OR untuk Supabase JS `.or()` method.
 * Format: `col1.ilike.*query*,col2.ilike.*query*`
 *
 * IMPORTANT: nilai q harus di-escape — Supabase OR string parser
 * pakai koma sebagai separator dan titik sebagai field separator.
 * Untuk safety, kita validate q tidak punya karakter berbahaya.
 */
export function buildOrSearchString(
  q: string,
  searchable: SearchableColumn[]
): string | null {
  if (!q.trim()) return null;
  if (searchable.length === 0) return null;

  // Escape comma + parentheses dari user input (mereka break PostgREST or syntax)
  const safeQ = q.replace(/[,\\()]/g, " ").trim();
  if (!safeQ) return null;

  const pattern = `*${safeQ}*`;

  return searchable
    .filter((c) => isSafeIdent(c.physical_column_name))
    .map((c) => `${c.physical_column_name}.ilike.${pattern}`)
    .join(",");
}

/**
 * Build sort criteria yang valid (filter kolom yang ada di dataset).
 * Tetap allow kolom system yang diawali `_`.
 */
export function buildValidSort(
  sort: SortCriterion[],
  validColumns: Set<string>
): SortCriterion[] {
  return sort.filter((s) => {
    if (!isSafeIdent(s.column)) return false;
    if (s.column.startsWith("_")) return true; // kolom system
    return validColumns.has(s.column);
  });
}
