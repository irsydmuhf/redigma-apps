"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowUpDown, Sparkles } from "lucide-react";
import { SortPanel } from "./sort-panel";
import {
  applyStateChange,
  buildHref,
  type DatasetViewState,
} from "@/lib/datasets/url-state";

type Column = {
  physical_column_name: string;
  display_name: string;
  data_type: string;
};

export function DatasetToolbar({
  basePath,
  state,
  columns,
  totalCount,
  shownCount,
}: {
  basePath: string;
  state: DatasetViewState;
  columns: Column[];
  totalCount: number;
  shownCount: number;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(state.q);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync searchInput dengan URL state (kalau user back/forward).
  // Wrap di queueMicrotask supaya bukan sync setState di effect body.
  useEffect(() => {
    queueMicrotask(() => setSearchInput(state.q));
  }, [state.q]);

  function pushState(changes: Partial<DatasetViewState>) {
    const next = applyStateChange(state, changes);
    router.push(buildHref(basePath, next));
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushState({ q: value.trim() });
    }, 400);
  }

  function clearSearch() {
    setSearchInput("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pushState({ q: "", col: "" });
  }

  const selectedColumn = columns.find(
    (c) => c.physical_column_name === state.col
  );
  const isSearching = !!state.q;
  const hasSort = state.sort.length > 0;

  return (
    <div className="border-b border-neutral-100 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Column dropdown */}
        <select
          value={state.col}
          onChange={(e) => pushState({ col: e.target.value })}
          className="h-10 max-w-[200px] truncate rounded-2xl border border-neutral-200 bg-white px-3 text-sm"
          aria-label="Kolom pencarian"
        >
          <option value="">Semua Kolom</option>
          {columns.map((c) => (
            <option key={c.physical_column_name} value={c.physical_column_name}>
              {c.display_name}
            </option>
          ))}
        </select>

        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={
              selectedColumn
                ? `Cari di ${selectedColumn.display_name}...`
                : "Cari di semua kolom..."
            }
            className="h-10 w-full rounded-2xl border border-neutral-200 bg-white pl-10 pr-10 text-sm outline-none focus:border-blue-400"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Hapus pencarian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort button */}
        <button
          type="button"
          onClick={() => setSortPanelOpen(true)}
          className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition ${
            hasSort
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <ArrowUpDown className="h-4 w-4" />
          Sort
          {hasSort && (
            <span className="rounded-full bg-blue-200 px-1.5 py-0.5 text-xs">
              {state.sort.length}
            </span>
          )}
        </button>
      </div>

      {/* Count indicator */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        {isSearching ? (
          <>
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span>
              Menampilkan{" "}
              <span className="font-semibold text-neutral-900">
                {shownCount.toLocaleString("id-ID")}
              </span>{" "}
              dari{" "}
              <span className="font-semibold text-neutral-900">
                {totalCount.toLocaleString("id-ID")}
              </span>{" "}
              hasil untuk{" "}
              <span className="font-semibold text-blue-700">
                &ldquo;{state.q}&rdquo;
              </span>
              {selectedColumn && (
                <>
                  {" "}di kolom{" "}
                  <span className="font-semibold">
                    {selectedColumn.display_name}
                  </span>
                </>
              )}
            </span>
          </>
        ) : (
          <span>
            Menampilkan{" "}
            <span className="font-semibold text-neutral-900">
              {shownCount.toLocaleString("id-ID")}
            </span>{" "}
            dari{" "}
            <span className="font-semibold text-neutral-900">
              {totalCount.toLocaleString("id-ID")}
            </span>{" "}
            baris
          </span>
        )}
      </div>

      {sortPanelOpen && (
        <SortPanel
          state={state}
          columns={columns}
          basePath={basePath}
          onClose={() => setSortPanelOpen(false)}
        />
      )}
    </div>
  );
}
