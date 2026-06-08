"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, X, Plus, Trash2 } from "lucide-react";
import {
  applyStateChange,
  buildHref,
  type DatasetViewState,
  type SortCriterion,
  type SortDirection,
} from "@/lib/datasets/url-state";

type Column = {
  physical_column_name: string;
  display_name: string;
  data_type: string;
};

export function SortPanel({
  state,
  columns,
  basePath,
  onClose,
}: {
  state: DatasetViewState;
  columns: Column[];
  basePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SortCriterion[]>(state.sort);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addCriterion() {
    const used = new Set(draft.map((s) => s.column));
    const next = columns.find((c) => !used.has(c.physical_column_name));
    if (!next) return;
    setDraft([...draft, { column: next.physical_column_name, direction: "asc" }]);
  }

  function removeCriterion(index: number) {
    setDraft(draft.filter((_, i) => i !== index));
  }

  function moveCriterion(index: number, delta: number) {
    const ni = index + delta;
    if (ni < 0 || ni >= draft.length) return;
    const next = [...draft];
    [next[index], next[ni]] = [next[ni], next[index]];
    setDraft(next);
  }

  function updateCriterion(
    index: number,
    patch: Partial<SortCriterion>
  ) {
    setDraft(draft.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function clearAll() {
    setDraft([]);
  }

  function apply() {
    const next = applyStateChange(state, { sort: draft });
    router.push(buildHref(basePath, next));
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-neutral-900/30"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neutral-100 bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Urutkan berdasarkan
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {draft.length === 0 ? (
            <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              Belum ada sort. Default: tanggal import terbaru.
            </p>
          ) : (
            draft.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-2"
              >
                {/* Priority badge */}
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {i + 1}
                </div>

                {/* Column dropdown */}
                <select
                  value={s.column}
                  onChange={(e) =>
                    updateCriterion(i, { column: e.target.value })
                  }
                  className="h-9 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                >
                  {columns.map((c) => (
                    <option
                      key={c.physical_column_name}
                      value={c.physical_column_name}
                      disabled={
                        c.physical_column_name !== s.column &&
                        draft.some(
                          (x) => x.column === c.physical_column_name
                        )
                      }
                    >
                      {c.display_name}
                    </option>
                  ))}
                </select>

                {/* Direction toggle */}
                <select
                  value={s.direction}
                  onChange={(e) =>
                    updateCriterion(i, {
                      direction: e.target.value as SortDirection,
                    })
                  }
                  className="h-9 w-24 rounded-xl border border-neutral-200 bg-white px-2 text-sm"
                >
                  <option value="asc">Asc ↑</option>
                  <option value="desc">Desc ↓</option>
                </select>

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveCriterion(i, -1)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30"
                    aria-label="Naikkan prioritas"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCriterion(i, 1)}
                    disabled={i === draft.length - 1}
                    className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30"
                    aria-label="Turunkan prioritas"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeCriterion(i)}
                  className="rounded-xl p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
                  aria-label="Hapus"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {draft.length < columns.length && (
          <button
            type="button"
            onClick={addCriterion}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah kolom sort
          </button>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={clearAll}
            disabled={draft.length === 0}
            className="text-sm font-medium text-neutral-600 hover:text-red-600 disabled:opacity-30"
          >
            Hapus semua
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={apply}
              className="mesh-blue rounded-2xl px-5 py-2 text-sm font-semibold text-white shadow"
            >
              Terapkan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
