"use client";

/**
 * Wizard: list nama unmapped + per baris bisa pilih:
 *   - Map ke akun yg sudah ada (dropdown)
 *   - Skip (nanti aja)
 *
 * Setelah selesai map → klik "Simpan Semua" → addAlias massal +
 * relinkAllForRole untuk re-scan transaksi.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { addAlias, relinkAllForRole } from "@/server-actions/admin/alias-actions";

type UnmappedName = {
  rawName: string;
  transactionCount: number;
  totalAmount: number;
};

type Candidate = {
  id: string;
  email: string;
  fullName: string | null;
};

type Decision = {
  // user_id atau "" (skip)
  targetUserId: string;
};

export function SetupRoleWizard({
  roleCode,
  roleLabel,
  unmappedNames,
  candidates,
}: {
  roleCode: string;
  roleLabel: string;
  unmappedNames: UnmappedName[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<{
    success: number;
    failed: { name: string; error: string }[];
  } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [query, setQuery] = useState("");

  const fmtRp = new Intl.NumberFormat("id-ID");

  function setDecision(name: string, userId: string) {
    setDecisions((p) => ({ ...p, [name]: { targetUserId: userId } }));
  }

  function saveAll() {
    const toProcess = Object.entries(decisions).filter(
      ([, d]) => d.targetUserId
    );
    if (toProcess.length === 0) return;

    setResults(null);
    setProgress({ done: 0, total: toProcess.length });

    startTransition(async () => {
      const failed: { name: string; error: string }[] = [];
      let success = 0;
      let done = 0;

      for (const [name, dec] of toProcess) {
        const res = await addAlias({
          userId: dec.targetUserId,
          roleCode,
          aliasText: name,
          autoRelink: false, // pakai relinkAllForRole sekali di akhir
        });
        if (res.ok) success += 1;
        else failed.push({ name, error: res.error });
        done += 1;
        setProgress({ done, total: toProcess.length });
      }

      // Sekali jalan di akhir, scan semua transaksi peran ini
      await relinkAllForRole(roleCode);

      setResults({ success, failed });
      router.refresh();
    });
  }

  const filteredNames = query.trim()
    ? unmappedNames.filter((n) =>
        n.rawName.toLowerCase().includes(query.toLowerCase())
      )
    : unmappedNames;

  const decidedCount = Object.values(decisions).filter(
    (d) => d.targetUserId
  ).length;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-neutral-100 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {unmappedNames.length} nama unik belum ter-mapping
            </p>
            <p className="text-xs text-neutral-600">
              {decidedCount} sudah dipilih, {unmappedNames.length - decidedCount}{" "}
              belum.
            </p>
          </div>
          <button
            type="button"
            onClick={saveAll}
            disabled={pending || decidedCount === 0}
            className="mesh-blue inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan {decidedCount} alias & Re-scan
          </button>
        </div>

        {pending && (
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="mesh-blue h-2 transition-all"
                style={{
                  width: `${
                    progress.total
                      ? (progress.done / progress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-neutral-600">
              Memproses {progress.done} / {progress.total}...
            </p>
          </div>
        )}

        {results && (
          <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm">
            <p className="font-semibold text-green-800 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {results.success} alias berhasil disimpan & transaksi historis
              ter-link.
            </p>
            {results.failed.length > 0 && (
              <div className="mt-2 text-xs text-amber-800">
                <p className="font-semibold">
                  {results.failed.length} gagal:
                </p>
                <ul className="list-disc pl-5">
                  {results.failed.slice(0, 5).map((f) => (
                    <li key={f.name}>
                      {f.name}: {f.error}
                    </li>
                  ))}
                  {results.failed.length > 5 && (
                    <li>... dan {results.failed.length - 5} lagi</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari nama..."
        className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm"
      />

      <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-3 text-left">Nama di Excel</th>
              <th className="px-5 py-3 text-right">Transaksi</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-left">Map ke akun</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredNames.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center text-neutral-500"
                >
                  {unmappedNames.length === 0
                    ? `Selesai! Semua nama ${roleLabel} sudah ke-mapping.`
                    : "Tidak ada nama yang cocok dengan pencarian."}
                </td>
              </tr>
            ) : (
              filteredNames.map((n) => {
                const dec = decisions[n.rawName];
                return (
                  <tr key={n.rawName}>
                    <td className="px-5 py-3 font-medium text-neutral-900 break-all">
                      {n.rawName}
                    </td>
                    <td className="px-5 py-3 text-right text-neutral-700">
                      {n.transactionCount}
                    </td>
                    <td className="px-5 py-3 text-right text-neutral-700">
                      Rp {fmtRp.format(Math.round(n.totalAmount))}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={dec?.targetUserId ?? ""}
                        onChange={(e) =>
                          setDecision(n.rawName, e.target.value)
                        }
                        className="h-9 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                      >
                        <option value="">— pilih akun —</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName || c.email}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {candidates.length === 0 && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Belum ada akun yang relevan untuk peran {roleLabel}. Bikin user dulu
            di Admin User → assign ke divisi {roleLabel}.
          </p>
        </div>
      )}
    </div>
  );
}
