"use client";

import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  applyStateChange,
  buildHref,
  type DatasetViewState,
  type SortDirection,
} from "@/lib/datasets/url-state";

type Column = {
  physical_column_name: string;
  display_name: string;
  data_type: string;
};

function formatCell(val: unknown, dataType: string): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Ya" : "Tidak";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (dataType === "date" && typeof val === "string") {
    // Format YYYY-MM-DD → 1 Jan 2026 (Indonesian)
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const months = [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
      ];
      const day = parseInt(m[3], 10);
      const month = months[parseInt(m[2], 10) - 1] ?? m[2];
      return `${day} ${month} ${m[1]}`;
    }
  }
  if (dataType === "currency" && typeof val === "number") {
    return `Rp ${val.toLocaleString("id-ID")}`;
  }
  if (dataType === "number" && typeof val === "number") {
    return val.toLocaleString("id-ID");
  }
  return String(val);
}

export function DatasetTable({
  basePath,
  state,
  columns,
  rows,
}: {
  basePath: string;
  state: DatasetViewState;
  columns: Column[];
  rows: Record<string, unknown>[];
}) {
  const router = useRouter();

  // Map column → sort priority (1-based) untuk badge multi-sort
  const sortIndex = new Map<string, { priority: number; dir: SortDirection }>();
  state.sort.forEach((s, i) => {
    sortIndex.set(s.column, { priority: i + 1, dir: s.direction });
  });

  function handleHeaderClick(col: string) {
    // Cycle: tidak ada sort → asc → desc → clear
    const existing = state.sort.find((s) => s.column === col);
    const isOnlyOne = state.sort.length === 1 && state.sort[0]?.column === col;

    if (!existing) {
      // Single sort baru, replace existing sort
      const next = applyStateChange(state, {
        sort: [{ column: col, direction: "asc" }],
      });
      router.push(buildHref(basePath, next));
      return;
    }

    if (existing.direction === "asc") {
      // Asc → desc
      const next = applyStateChange(state, {
        sort: [{ column: col, direction: "desc" }],
      });
      router.push(buildHref(basePath, next));
      return;
    }

    // Desc → clear (kalau ini satu-satunya sort) atau back to no sort
    if (isOnlyOne) {
      const next = applyStateChange(state, { sort: [] });
      router.push(buildHref(basePath, next));
    } else {
      // Hapus dari multi-sort
      const next = applyStateChange(state, {
        sort: state.sort.filter((s) => s.column !== col),
      });
      router.push(buildHref(basePath, next));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50/50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {columns.map((c) => {
              const sortInfo = sortIndex.get(c.physical_column_name);
              return (
                <th
                  key={c.physical_column_name}
                  className="whitespace-nowrap px-4 py-3 sm:px-6"
                >
                  <button
                    type="button"
                    onClick={() => handleHeaderClick(c.physical_column_name)}
                    className="group inline-flex items-center gap-1.5 hover:text-neutral-900"
                  >
                    <span>{c.display_name}</span>
                    {sortInfo ? (
                      <>
                        {sortInfo.dir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        {state.sort.length > 1 && (
                          <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                            {sortInfo.priority}
                          </span>
                        )}
                      </>
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 text-neutral-300 opacity-0 transition group-hover:opacity-100" />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length || 1}
                className="px-4 py-12 text-center text-sm text-neutral-500 sm:px-6"
              >
                {state.q
                  ? `Tidak ada hasil untuk "${state.q}".`
                  : "Tabel kosong."}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row._id as string} className="hover:bg-neutral-50/50">
                {columns.map((c) => (
                  <td
                    key={c.physical_column_name}
                    className="whitespace-nowrap px-4 py-3 text-neutral-700 sm:px-6"
                  >
                    {formatCell(row[c.physical_column_name], c.data_type)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
