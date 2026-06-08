"use client";

/**
 * Tombol nonaktifkan user dengan dialog opsional transfer alias ke pengganti.
 * Sesuai keputusan desain Pertanyaan 8 & 9.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserX, X, Loader2 } from "lucide-react";
import { toggleUserActive } from "@/server-actions/admin/toggle-user-active";
import { transferAliases } from "@/server-actions/admin/alias-actions";

type Candidate = {
  id: string;
  email: string;
  fullName: string | null;
};

export function DeactivateButton({
  userId,
  userName,
  replacementCandidates,
  activeRoleCodes,
}: {
  userId: string;
  userName: string;
  replacementCandidates: Candidate[];
  activeRoleCodes: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cutoffDate, setCutoffDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [transferMode, setTransferMode] = useState<"none" | "transfer">("none");
  const [replacementId, setReplacementId] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      // Step 1: transfer alias (kalau diminta)
      if (transferMode === "transfer" || transferMode === "none") {
        const res = await transferAliases({
          fromUserId: userId,
          toUserId: transferMode === "transfer" ? replacementId : null,
          cutoffDate,
          roleCodes: activeRoleCodes,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }

      // Step 2: deactivate user
      const res = await toggleUserActive({ userId, isActive: false });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        <UserX className="h-4 w-4" />
        Nonaktifkan
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                Nonaktifkan: {userName}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  Tanggal nonaktif
                </label>
                <input
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm"
                />
                <p className="text-xs text-neutral-500">
                  Transaksi <strong>sebelum</strong> tanggal ini tetap milik user
                  ini. Mulai tanggal ini akan ke pengganti (kalau ada).
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-neutral-700">
                  Nama Excel (alias) yang dimiliki user ini akan...
                </p>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-3 cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      checked={transferMode === "none"}
                      onChange={() => setTransferMode("none")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        Tutup tanpa pengganti
                      </p>
                      <p className="text-xs text-neutral-600">
                        Transaksi baru yang masih pakai nama lama akan masuk
                        Inbox Perlu Ditinjau.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-3 cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      checked={transferMode === "transfer"}
                      onChange={() => setTransferMode("transfer")}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900">
                        Transfer ke pengganti
                      </p>
                      <p className="mb-2 text-xs text-neutral-600">
                        Mulai tanggal nonaktif, alias akan otomatis nyambung ke
                        akun pengganti.
                      </p>
                      {transferMode === "transfer" && (
                        <select
                          value={replacementId}
                          onChange={(e) => setReplacementId(e.target.value)}
                          className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                        >
                          <option value="">— pilih pengganti —</option>
                          {replacementCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.fullName || c.email}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-10 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  pending ||
                  (transferMode === "transfer" && !replacementId)
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Nonaktifkan{transferMode === "transfer" ? " & Transfer" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
