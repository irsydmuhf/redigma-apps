/**
 * Normalisasi display name → physical name yang aman untuk Postgres.
 *
 * Aturan:
 * - lowercase semua
 * - karakter non-alphanumeric → underscore
 * - berturut-turut underscore dipersingkat jadi 1
 * - kalau diawali angka atau reserved keyword → prefix `t_`
 * - max 63 karakter
 */

const RESERVED_KEYWORDS = new Set([
  "user",
  "table",
  "select",
  "from",
  "where",
  "insert",
  "update",
  "delete",
  "create",
  "drop",
  "alter",
  "order",
  "group",
  "by",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "on",
  "as",
  "and",
  "or",
  "not",
  "null",
  "true",
  "false",
  "primary",
  "key",
  "foreign",
  "references",
  "default",
  "check",
  "unique",
  "index",
  "view",
  "schema",
  "database",
  "grant",
  "revoke",
  "with",
  "having",
  "case",
  "when",
  "then",
  "else",
  "end",
]);

// Limit ke 56 char untuk leave room dari suffix (_2, _3, ...) saat dedupe nama.
// Postgres identifier max 63 char, tapi kita pakai nama policy STATIS jadi
// suffix tidak masalah untuk policy.
const MAX_LEN = 56;

export function normalizePhysicalName(displayName: string): string {
  if (!displayName) return "t_unnamed";

  let s = displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!s) return "t_unnamed";

  if (/^[0-9]/.test(s) || RESERVED_KEYWORDS.has(s)) {
    s = "t_" + s;
  }

  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN);
  }

  return s;
}

/**
 * Generate physical name yang unik di antara existing names.
 * Kalau bentrok, tambah suffix _2, _3, dst.
 */
export function uniquePhysicalName(
  displayName: string,
  existing: Set<string>
): string {
  const base = normalizePhysicalName(displayName);
  if (!existing.has(base)) return base;

  let i = 2;
  while (existing.has(`${base}_${i}`)) {
    i++;
  }
  return `${base}_${i}`;
}
