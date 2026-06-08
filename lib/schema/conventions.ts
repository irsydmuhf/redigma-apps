/**
 * Convention soft-link: identifikasi kolom yang akan dinormalisasi
 * ke kolom system (_normalized_phone, _normalized_email, dll).
 *
 * Berguna untuk matching lintas tabel di Fase 2 (master tables).
 */

export type Convention = "phone" | "email" | "sku" | "nik";

const PATTERNS: Record<Convention, RegExp[]> = {
  phone: [/\bno_?wa\b/i, /\bphone\b/i, /\bhp\b/i, /\bwa\b/i, /\bwhatsapp\b/i, /\btelepon\b/i, /\bhandphone\b/i],
  email: [/\bemail\b/i, /\bsurel\b/i],
  sku: [/\bsku\b/i, /\bproduct_?code\b/i, /\bkode_?produk\b/i],
  nik: [/\bnik\b/i, /\bemployee_?id\b/i, /\bid_?karyawan\b/i, /\bnip\b/i],
};

const LABEL: Record<Convention, string> = {
  phone: "Telepon / WA",
  email: "Email",
  sku: "SKU Produk",
  nik: "NIK / ID Karyawan",
};

/**
 * Cek apakah display_name kolom cocok dengan salah satu convention.
 * Return convention type kalau cocok, null kalau tidak.
 */
export function detectConvention(displayName: string): Convention | null {
  const clean = displayName.trim().toLowerCase().replace(/[^a-z0-9_\s]/g, "");
  for (const [conv, patterns] of Object.entries(PATTERNS) as [
    Convention,
    RegExp[]
  ][]) {
    if (patterns.some((re) => re.test(clean))) {
      return conv;
    }
  }
  return null;
}

export function conventionLabel(conv: Convention): string {
  return LABEL[conv];
}

/**
 * Mapping convention → kolom system di tabel dinamis.
 */
export function conventionSystemColumn(conv: Convention): string {
  return `_normalized_${conv}`;
}
