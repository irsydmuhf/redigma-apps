export type DataType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  | "phone"
  | "email";

const ID_MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", jun: "06",
  jul: "07", agu: "08", agt: "08", sep: "09", okt: "10", nov: "11", des: "12",
};

const ID_MONTH_DATE_REGEX =
  /^(\d{1,2})\s+(jan|feb|mar|apr|mei|jun|jul|agu|agt|sep|okt|nov|des)[a-z]*\s+(\d{4})$/i;

const DATE_PATTERNS: { regex: RegExp; parse: (s: string) => string | null }[] = [
  { regex: /^(\d{4})-(\d{2})-(\d{2})$/, parse: (s) => s },
  {
    regex: /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
    parse: (s) => {
      const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (!m) return null;
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    },
  },
  {
    regex: ID_MONTH_DATE_REGEX,
    parse: (s) => {
      const m = s.toLowerCase().match(ID_MONTH_DATE_REGEX);
      if (!m) return null;
      const [, d, mo, y] = m;
      return `${y}-${ID_MONTH_MAP[mo]}-${d.padStart(2, "0")}`;
    },
  },
];

const BOOLEAN_VALUES = new Set([
  "true", "false", "ya", "tidak", "yes", "no", "1", "0",
]);

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const CURRENCY_PREFIX = /^(rp\.?\s*|idr\s*)/i;

export function parseNumberID(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[\s ]/g, "").replace(CURRENCY_PREFIX, "");
  let normalized = cleaned;
  if (/^-?[\d.]+,\d+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^-?[\d,]+\.\d+$/.test(cleaned)) {
    normalized = cleaned.replace(/,/g, "");
  } else if (/^-?[\d.]+$/.test(cleaned) && cleaned.includes(".")) {
    const lastDot = cleaned.lastIndexOf(".");
    const after = cleaned.length - lastDot - 1;
    if (after === 3 && (cleaned.match(/\./g)?.length ?? 0) >= 1) {
      normalized = cleaned.replace(/\./g, "");
    }
  } else if (/^-?[\d,]+$/.test(cleaned)) {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseCurrencyID(s: string): number | null {
  if (!s) return null;
  return parseNumberID(s);
}

export function parseDateID(s: string): string | null {
  for (const p of DATE_PATTERNS) {
    if (p.regex.test(s)) return p.parse(s);
  }
  return null;
}

/**
 * Normalize nomor telepon/WA — terima Indonesia & internasional.
 *
 * Aturan:
 * - Buang spasi, tanda kurung, strip, titik
 * - `+xxx` → strip `+`, keep digit (E.164 international)
 * - `0xxx` → convert ke `62xxx` (asumsi Indonesia format lokal)
 * - Selain itu → keep digit apa adanya (anggap sudah ada country code,
 *   misal `15551234567` US, `658123456` Singapore, `447123456789` UK)
 * - Total digit 7-15 (E.164 standard)
 *
 * Contoh:
 *   "081234567890" → "6281234567890"  (Indonesia local)
 *   "+6281234567890" → "6281234567890" (Indonesia E.164)
 *   "+15551234567" → "15551234567"    (US E.164)
 *   "447123456789" → "447123456789"   (UK, sudah country code)
 *   "abc123" → null                   (tidak valid)
 */
export function parsePhoneID(s: string): string | null {
  if (!s) return null;
  let cleaned = s.replace(/[\s().\-]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  // Harus digit only, panjang 7-15 (E.164)
  if (!/^\d{7,15}$/.test(cleaned)) return null;

  // Local Indonesia (0xxx) → 62xxx
  if (cleaned.startsWith("0")) {
    return "62" + cleaned.slice(1);
  }

  // Sudah ada country code atau international format → keep
  return cleaned;
}

export function parseEmail(s: string): string | null {
  if (!s) return null;
  const cleaned = s.trim().toLowerCase();
  if (EMAIL_REGEX.test(cleaned)) return cleaned;
  return null;
}

export function detectColumnType(samples: string[]): DataType {
  const nonEmpty = samples
    .map((s) => (s ?? "").toString().trim())
    .filter((s) => s.length > 0);

  if (nonEmpty.length === 0) return "text";

  let dateCount = 0;
  let numberCount = 0;
  let currencyCount = 0;
  let boolCount = 0;
  let phoneCount = 0;
  let emailCount = 0;

  for (const s of nonEmpty) {
    if (parseDateID(s) !== null) dateCount++;
    if (parseNumberID(s) !== null) numberCount++;
    if (CURRENCY_PREFIX.test(s.trim())) currencyCount++;
    if (BOOLEAN_VALUES.has(s.toLowerCase())) boolCount++;
    if (parsePhoneID(s) !== null) phoneCount++;
    if (parseEmail(s) !== null) emailCount++;
  }

  const threshold = nonEmpty.length * 0.9;

  if (emailCount >= threshold) return "email";
  if (phoneCount >= threshold) return "phone";
  if (currencyCount >= threshold) return "currency";
  if (dateCount >= threshold) return "date";
  if (numberCount >= threshold) return "number";
  if (boolCount >= threshold) return "boolean";
  return "text";
}

/**
 * Coerce nilai string → tipe data target.
 * Mengembalikan:
 *   - null kalau input kosong (akan jadi NULL di DB)
 *   - value yang sudah dinormalisasi kalau berhasil
 *   - undefined kalau gagal parse (error)
 */
export function coerceValue(raw: string, type: DataType): unknown {
  const s = (raw ?? "").toString().trim();
  if (s === "") return null;

  switch (type) {
    case "number":
    case "currency": {
      const n = parseNumberID(s);
      return n === null ? undefined : n;
    }
    case "date": {
      const d = parseDateID(s);
      return d === null ? undefined : d;
    }
    case "boolean": {
      const lower = s.toLowerCase();
      if (["true", "ya", "yes", "1"].includes(lower)) return true;
      if (["false", "tidak", "no", "0"].includes(lower)) return false;
      return undefined;
    }
    case "phone": {
      const p = parsePhoneID(s);
      return p === null ? undefined : p;
    }
    case "email": {
      const e = parseEmail(s);
      return e === null ? undefined : e;
    }
    case "text":
    default:
      return s;
  }
}
