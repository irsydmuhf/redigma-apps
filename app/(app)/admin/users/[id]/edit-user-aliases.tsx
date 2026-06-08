"use client";

/**
 * Edit alias per user — Admin/Head/SPV bisa tambah/hapus.
 * Tiap perubahan langsung simpan (no batch submit) supaya auto-relink
 * transaksi langsung jalan.
 */

import { useState, useTransition } from "react";
import { Tag, Plus, X, ListChecks, Loader2 } from "lucide-react";
import { PilihDariDataDialog } from "@/components/alias/pilih-dari-data-dialog";
import { addAlias, removeAlias } from "@/server-actions/admin/alias-actions";
import type { RoleColumn } from "@/components/alias/alias-input-section";

type Alias = {
  id: number;
  roleCode: string;
  aliasText: string;
  validFrom: string | null;
  validTo: string | null;
};

export function EditUserAliases({
  userId,
  userDivisionCodes,
  initialAliases,
  roleColumns,
}: {
  userId: string;
  userDivisionCodes: string[];
  initialAliases: Alias[];
  roleColumns: RoleColumn[];
}) {
  const [aliases, setAliases] = useState<Alias[]>(initialAliases);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picker, setPicker] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Peran yg relevant dengan divisi user ini
  const relevantRoles = roleColumns.filter((rc) =>
    rc.divisions.some((d) => userDivisionCodes.includes(d))
  );

  function handleAdd(roleCode: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await addAlias({
        userId,
        roleCode,
        aliasText: trimmed,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAliases((prev) => [
        ...prev,
        {
          id: res.aliasId!,
          roleCode,
          aliasText: trimmed,
          validFrom: null,
          validTo: null,
        },
      ]);
      setDrafts((p) => ({ ...p, [roleCode]: "" }));
      if (res.relinked) {
        setInfo(`Alias ditambahkan. ${res.relinked} transaksi disambungkan.`);
      } else {
        setInfo("Alias berhasil ditambahkan.");
      }
    });
  }

  function handleRemove(aliasId: number) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await removeAlias({ aliasId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      setInfo("Alias dihapus.");
    });
  }

  if (relevantRoles.length === 0) {
    return (
      <section className="rounded-3xl border border-neutral-100 bg-white p-7">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-neutral-500" />
          <h2 className="text-lg font-semibold text-neutral-900">
            Nama di Excel (Alias)
          </h2>
        </div>
        <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          User ini tidak punya divisi yang muncul di kolom Excel transaksi
          (CS / Adv / CRM / Live / Content). Tidak perlu alias.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-neutral-100 bg-white p-7">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-neutral-500" />
        <h2 className="text-lg font-semibold text-neutral-900">
          Nama di Excel (Alias)
        </h2>
        {pending && (
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
        )}
      </div>

      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
        💡 Setiap nama yang ditambahkan akan otomatis nyambungin transaksi
        Excel yang pakai nama itu ke user ini.
      </p>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {info}
        </p>
      )}

      <div className="space-y-4">
        {relevantRoles.map((rc) => {
          const roleAliases = aliases.filter((a) => a.roleCode === rc.code);
          const draft = drafts[rc.code] ?? "";
          return (
            <div
              key={rc.code}
              className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">
                  Kolom Excel: {rc.label}
                </p>
                <button
                  type="button"
                  onClick={() => setPicker(rc.code)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Pilih dari Data
                </button>
              </div>

              {rc.excelColumnHint && (
                <p className="text-xs text-neutral-500">
                  Biasanya kolom: &ldquo;{rc.excelColumnHint}&rdquo;
                </p>
              )}

              {roleAliases.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {roleAliases.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-900"
                    >
                      {a.aliasText}
                      {a.validTo && (
                        <span className="text-[10px] text-blue-700">
                          (sampai {a.validTo})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemove(a.id)}
                        disabled={pending}
                        className="text-blue-700 hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [rc.code]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd(rc.code, draft);
                    }
                  }}
                  placeholder={`Misal: ${rc.label}.Budi, ${rc.label} Budi, Budi`}
                  className="h-10 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => handleAdd(rc.code, draft)}
                  disabled={!draft.trim() || pending}
                  className="inline-flex h-10 items-center gap-1 rounded-xl bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {picker && (
        <PilihDariDataDialog
          open={true}
          onClose={() => setPicker(null)}
          roleCode={picker}
          roleLabel={
            relevantRoles.find((r) => r.code === picker)?.label ?? picker
          }
          currentUserId={userId}
          existingAliases={aliases
            .filter((a) => a.roleCode === picker)
            .map((a) => a.aliasText)}
          onPick={(names) => {
            const roleCode = picker;
            startTransition(async () => {
              for (const name of names) {
                const res = await addAlias({
                  userId,
                  roleCode,
                  aliasText: name,
                });
                if (res.ok && res.aliasId) {
                  setAliases((prev) => [
                    ...prev,
                    {
                      id: res.aliasId!,
                      roleCode,
                      aliasText: name,
                      validFrom: null,
                      validTo: null,
                    },
                  ]);
                }
              }
              setInfo(`Berhasil menambahkan ${names.length} alias.`);
            });
          }}
        />
      )}
    </section>
  );
}
