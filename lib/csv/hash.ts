/**
 * Hash utilities.
 * - hashFile: SHA-256 dari isi file (untuk dedup "file ini sudah pernah upload").
 * - buildRowKey: composite key string per baris (untuk dedup row-level).
 */

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(digest);
}

/**
 * Bangun composite key dari nilai-nilai kolom unique-key.
 * Pakai untuk row-level dedup di SQL (`_row_hash`).
 *
 * Strategy: join nilai dengan `||` (separator yang tidak mungkin di data),
 * trim + lowercase. Simple tapi cukup unik untuk identitas baris.
 *
 * Return null kalau:
 *   - tidak ada unique column
 *   - semua nilai kosong (baris tidak punya identitas)
 */
export function buildRowKey(
  row: Record<string, unknown>,
  uniqueColumns: string[]
): string | null {
  if (uniqueColumns.length === 0) return null;

  const values = uniqueColumns.map((col) => {
    const v = row[col];
    if (v === null || v === undefined) return "";
    return String(v).trim().toLowerCase();
  });

  if (values.every((v) => v === "")) return null;

  return values.join("||");
}
