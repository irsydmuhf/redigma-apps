"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  applyStateChange,
  buildHref,
  PAGE_SIZES,
  type DatasetViewState,
  type PageSize,
} from "@/lib/datasets/url-state";

export function DatasetPagination({
  basePath,
  state,
  totalCount,
  totalPages,
  shownCount,
}: {
  basePath: string;
  state: DatasetViewState;
  totalCount: number;
  totalPages: number;
  shownCount: number;
}) {
  const router = useRouter();
  const [pageInput, setPageInput] = useState(String(state.page));

  useEffect(() => {
    queueMicrotask(() => setPageInput(String(state.page)));
  }, [state.page]);

  function pushState(changes: Partial<DatasetViewState>) {
    const next = applyStateChange(state, changes);
    router.push(buildHref(basePath, next));
  }

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(totalPages, page));
    if (clamped === state.page) return;
    pushState({ page: clamped });
  }

  function handlePageInputSubmit() {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
      goToPage(n);
    } else {
      setPageInput(String(state.page));
    }
  }

  const startRow = totalCount === 0 ? 0 : (state.page - 1) * state.size + 1;
  const endRow = (state.page - 1) * state.size + shownCount;

  return (
    <div className="border-t border-neutral-100 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Range info */}
        <p className="text-xs text-neutral-600 sm:text-sm">
          Baris {startRow.toLocaleString("id-ID")}–
          {endRow.toLocaleString("id-ID")} dari{" "}
          <span className="font-semibold text-neutral-900">
            {totalCount.toLocaleString("id-ID")}
          </span>
        </p>

        {/* Page navigation */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Prev */}
          <button
            type="button"
            onClick={() => goToPage(state.page - 1)}
            disabled={state.page <= 1}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Page input */}
          <div className="flex items-center gap-1.5 text-sm text-neutral-700">
            <span className="hidden sm:inline">Page</span>
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={handlePageInputSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="h-9 w-14 rounded-xl border border-neutral-200 px-2 text-center font-semibold outline-none focus:border-blue-400"
              aria-label="Halaman"
            />
            <span>/ {totalPages.toLocaleString("id-ID")}</span>
          </div>

          {/* Next */}
          <button
            type="button"
            onClick={() => goToPage(state.page + 1)}
            disabled={state.page >= totalPages}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Page size */}
          <div className="ml-2 flex items-center gap-2 border-l border-neutral-200 pl-3 text-sm text-neutral-700">
            <span className="hidden sm:inline">Per halaman:</span>
            <select
              value={state.size}
              onChange={(e) =>
                pushState({ size: parseInt(e.target.value, 10) as PageSize })
              }
              className="h-9 rounded-xl border border-neutral-200 bg-white px-2 text-sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.toLocaleString("id-ID")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
