// Type coercion utilities — duplicated dari lib/csv/detect.ts agar bisa
// dijalankan di Deno Edge Function (yang tidak punya akses ke Next.js code).

export type DataType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  | "phone"
  | "email";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const CURRENCY_PREFIX = /^(rp\.?\s*|idr\s*)/i;

function parseNumberID(s: string): number | null {
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

const ID_MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", jun: "06",
  jul: "07", agu: "08", agt: "08", sep: "09", okt: "10", nov: "11", des: "12",
};

function parseDateID(s: string): string | null {
  if (/^(\d{4})-(\d{2})-(\d{2})$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const idm = s.toLowerCase().match(
    /^(\d{1,2})\s+(jan|feb|mar|apr|mei|jun|jul|agu|agt|sep|okt|nov|des)[a-z]*\s+(\d{4})$/
  );
  if (idm) {
    const [, d, mo, y] = idm;
    return `${y}-${ID_MONTH_MAP[mo]}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parsePhoneID(s: string): string | null {
  // Terima Indonesia (0xxx, +62xxx) + internasional (+1xxx, +44xxx, dll).
  // E.164 standard: 7-15 digit total tanpa prefix +.
  if (!s) return null;
  let cleaned = s.replace(/[\s().\-]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (!/^\d{7,15}$/.test(cleaned)) return null;
  // Local Indonesia 0xxx → 62xxx
  if (cleaned.startsWith("0")) return "62" + cleaned.slice(1);
  // Sudah ada country code atau international → keep apa adanya
  return cleaned;
}

function parseEmail(s: string): string | null {
  if (!s) return null;
  const cleaned = s.trim().toLowerCase();
  if (EMAIL_REGEX.test(cleaned)) return cleaned;
  return null;
}

export function coerceValue(raw: string, type: DataType): unknown {
  const s = (raw ?? "").toString().trim();
  if (s === "") return null;

  switch (type) {
    case "number":
    case "currency": {
      const n = parseNumberID(s);
      return n; // null kalau gagal — column nullable di table dinamis
    }
    case "date":
      return parseDateID(s);
    case "boolean": {
      const lower = s.toLowerCase();
      if (["true", "ya", "yes", "1"].includes(lower)) return true;
      if (["false", "tidak", "no", "0"].includes(lower)) return false;
      return null;
    }
    case "phone":
      return parsePhoneID(s);
    case "email":
      return parseEmail(s);
    case "text":
    default:
      return s;
  }
}

// Convention → kolom system di tabel dinamis
const CONVENTION_PATTERNS: { conv: string; res: RegExp[] }[] = [
  {
    conv: "phone",
    res: [/\bno_?wa\b/i, /\bphone\b/i, /\bhp\b/i, /\bwa\b/i, /\bwhatsapp\b/i],
  },
  { conv: "email", res: [/\bemail\b/i, /\bsurel\b/i] },
  { conv: "sku", res: [/\bsku\b/i, /\bproduct_?code\b/i, /\bkode_?produk\b/i] },
  { conv: "nik", res: [/\bnik\b/i, /\bemployee_?id\b/i, /\bnip\b/i] },
];

export function detectConvention(displayName: string): string | null {
  const clean = displayName.trim().toLowerCase().replace(/[^a-z0-9_\s]/g, "");
  for (const p of CONVENTION_PATTERNS) {
    if (p.res.some((re) => re.test(clean))) return p.conv;
  }
  return null;
}
