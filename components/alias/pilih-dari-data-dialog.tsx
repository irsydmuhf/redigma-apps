"use client";

/**
 * Dialog "Pilih dari Data" — popup yang nampilkan nama unik dari Excel transaksi.
 * Dipakai di form bikin/edit user untuk tambah alias dari data nyata.
 */

import { useEffect, useState } from "react";
import { X, Search, Check, AlertTriangle, Loader2 } from "lucide-react";
import { getExcelNamesForRole } from "@/server-actions/admin/alias-actions";

type ExcelName = {
  raw_name: string;
  transaction_count: number;
  total_amount: number;
  linked_user_id: string | null;
  linked_user_email: string | null;
  linked_user_name: string | null;
  last_seen: string | null;
};

export function PilihDariDataDialog({
  open,
  onClose,
  roleCode,
  roleLabel,
  currentUserId,
  existingAliases,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  roleCode: string;
  roleLabel: string;
  currentUserId?: string; // user yg sedang dibuat/diedit
  existingAliases: string[]; // alias yg udah ada di form (jangan double-add)
  onPick: (names: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<ExcelName[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [hideUsed, setHideUsed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getExcelNamesForRole(roleCode)
      .then((data) => setNames(data))
      .finally(() => setLoading(false));
    setSelected(new Set());
    setQuery("");
  }, [open, roleCode]);

  if (!open) return null;

  const existingSet = new Set(
    existingAliases.map((a) => a.toLowerCase().trim().replace(/\s+/g, " "))
  );

  const filtered = names.filter((n) => {
    const normalized = n.raw_name.toLowerCase().trim().replace(/\s+/g, " ");
    if (existingSet.has(normalized)) return false;
    if (hideUsed && n.linked_user_id && n.linked_user_id !== currentUserId) {
      return false;
    }
    if (query.trim()) {
      return n.raw_name.toLowerCase().includes(query.toLowerCase());
    }
    return true;
  });

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  function pickAll() {
    onPick(Array.from(selected));
    onClose();
  }

  const fmtRp = new Intl.NumberFormat("id-ID");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Pilih dari Data Excel
            </h2>
            <p className="text-xs text-neutral-500">
              Kolom &ldquo;{roleLabel}&rdquo; — pilih nama yang ini orangnya
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="space-y-3 border-b border-neutral-100 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama..."
              className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={hideUsed}
              onChange={(e) => setHideUsed(e.target.checked)}
            />
            Sembunyikan nama yang sudah dipakai akun lain
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500">
              Tidak ada nama yang cocok.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((n) => {
                const isUsed =
                  n.linked_user_id && n.linked_user_id !== currentUserId;
                const isSel = selected.has(n.raw_name);
                return (
                  <button
                    key={n.raw_name}
                    type="button"
                    onClick={() => toggle(n.raw_name)}
                    disabled={!!isUsed}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      isSel
                        ? "border-blue-400 bg-blue-50"
                        : isUsed
                        ? "border-neutral-200 bg-neutral-50/50 opacity-60"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        isSel
                          ? "border-blue-500 bg-blue-500"
                          : "border-neutral-300"
                      }`}
                    >
                      {isSel && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-medium text-neutral-900">
                        {n.raw_name}
                      </p>
                      <p className="text-xs text-neutral-600">
                        {n.transaction_count} transaksi · Rp{" "}
                        {fmtRp.format(Math.round(n.total_amount || 0))}
                      </p>
                      {isUsed ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          Sudah dipakai akun:{" "}
                          {n.linked_user_name || n.linked_user_email}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-neutral-500">
                          Belum dipakai akun mana pun
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-6 py-4">
          <p className="text-xs text-neutral-600">
            {selected.size} nama dipilih
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={pickAll}
              disabled={selected.size === 0}
              className="mesh-blue h-10 rounded-2xl px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              Tambah {selected.size} alias
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
