// Helper bersama untuk menghitung ringkasan progress ADV dan deteksi at-risk.
// Dipakai oleh dashboard manager, halaman progress per program, dan detail per ADV.

const DAY_MS = 86_400_000;

// Supabase mengembalikan relasi nested sebagai object ATAU array (tergantung query).
// Helper ini menormalkannya jadi satu object.
export function nested<T = any>(v: any): T | undefined {
  return (Array.isArray(v) ? v[0] : v) ?? undefined;
}

export function moduleOf(row: any): any {
  return nested(row?.lms_program_modules);
}

function phaseOrder(mod: any): number {
  const ph = nested(mod?.lms_program_phases);
  return ph?.order_index ?? 0;
}

// Urutkan baris module_progress sesuai kurikulum (phase lalu modul).
export function sortByCurriculum<T extends { lms_program_modules?: any }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const am = moduleOf(a);
    const bm = moduleOf(b);
    const ap = phaseOrder(am);
    const bp = phaseOrder(bm);
    if (ap !== bp) return ap - bp;
    return (am?.order_index ?? 0) - (bm?.order_index ?? 0);
  });
}

export type EnrollmentSummary = {
  completedCount: number;
  totalModules: number;
  pct: number;
  currentModuleId: string | null;
  currentModuleTitle: string | null;
  /** Jumlah hari modul berjalan sedang dikerjakan (sejak started_at). */
  daysOnCurrent: number | null;
  /** Estimasi hari modul yang sedang dikerjakan. */
  estimatedDays: number | null;
  /** True bila modul aktif sudah melewati estimasi harinya. */
  isAtRisk: boolean;
};

/**
 * Hitung ringkasan progress satu enrollment dari baris module_progress.
 * `progressRows` harus menyertakan relasi lms_program_modules
 * (id, title, order_index, estimated_days, lms_program_phases(order_index)).
 */
export function summarizeEnrollment(
  progressRows: any[],
  totalModules: number,
): EnrollmentSummary {
  const sorted = sortByCurriculum((progressRows ?? []).filter((p) => moduleOf(p)));
  const completedCount = sorted.filter((p) => p.status === "completed").length;
  const total = totalModules || sorted.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const current = sorted.find((p) => p.status === "in_progress");
  const currentMod = current ? moduleOf(current) : null;
  const estimatedDays: number | null = currentMod?.estimated_days ?? null;

  let daysOnCurrent: number | null = null;
  let isAtRisk = false;
  if (current?.started_at) {
    daysOnCurrent = Math.floor((Date.now() - new Date(current.started_at).getTime()) / DAY_MS);
    if (estimatedDays != null && daysOnCurrent > estimatedDays) isAtRisk = true;
  }

  return {
    completedCount,
    totalModules: total,
    pct,
    currentModuleId: currentMod?.id ?? null,
    currentModuleTitle: currentMod?.title ?? null,
    daysOnCurrent,
    estimatedDays,
    isAtRisk,
  };
}
