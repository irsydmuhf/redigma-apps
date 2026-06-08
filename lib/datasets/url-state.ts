/**
 * URL state helpers untuk dataset viewer.
 * Pure functions — bisa dipakai server + client.
 */

export const PAGE_SIZES = [10, 100, 500, 1000, 5000] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type SortDirection = "asc" | "desc";

export type SortCriterion = {
  column: string; // physical_column_name
  direction: SortDirection;
};

export type DatasetViewState = {
  page: number;
  size: PageSize;
  q: string;
  col: string; // empty = global search
  sort: SortCriterion[];
};

const DEFAULT_STATE: DatasetViewState = {
  page: 1,
  size: 10,
  q: "",
  col: "",
  sort: [],
};

export function parseViewState(
  searchParams: Record<string, string | string[] | undefined>
): DatasetViewState {
  const getStr = (key: string): string => {
    const v = searchParams[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  const pageRaw = parseInt(getStr("page"), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const sizeRaw = parseInt(getStr("size"), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(sizeRaw)
    ? (sizeRaw as PageSize)
    : DEFAULT_STATE.size;

  const q = getStr("q").trim();
  const col = getStr("col").trim();

  // Sort format: "col1:desc,col2:asc"
  const sortStr = getStr("sort");
  const sort: SortCriterion[] = [];
  if (sortStr) {
    for (const part of sortStr.split(",")) {
      const [column, direction] = part.split(":");
      if (column && (direction === "asc" || direction === "desc")) {
        sort.push({ column: column.trim(), direction });
      }
    }
  }

  return { page, size, q, col, sort };
}

/**
 * Build URLSearchParams dari view state, omit param yang sama dengan default.
 */
export function buildSearchParams(state: DatasetViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("page", String(state.page));
  if (state.size !== DEFAULT_STATE.size) params.set("size", String(state.size));
  if (state.q) params.set("q", state.q);
  if (state.col) params.set("col", state.col);
  if (state.sort.length > 0) {
    params.set(
      "sort",
      state.sort.map((s) => `${s.column}:${s.direction}`).join(",")
    );
  }
  return params;
}

/**
 * Bangun URL baru dengan state berubah.
 * Search/size/col berubah → reset page=1.
 * Sort change → tetap pertahankan (Anda pilih: reset semua).
 *   ↑ KOREKSI: keputusan #6 = reset SEMUA termasuk sort change.
 */
export function applyStateChange(
  current: DatasetViewState,
  changes: Partial<DatasetViewState>
): DatasetViewState {
  const next = { ...current, ...changes };

  // Reset page kalau ada perubahan apapun selain page itu sendiri
  const isOnlyPageChange =
    Object.keys(changes).length === 1 && "page" in changes;
  if (!isOnlyPageChange) {
    next.page = 1;
  }

  return next;
}

export function buildHref(
  basePath: string,
  state: DatasetViewState
): string {
  const params = buildSearchParams(state);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
