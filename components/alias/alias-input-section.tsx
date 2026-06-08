"use client";

/**
 * Section "Nama di Excel" untuk form bikin/edit user.
 * Muncul per peran yang AKTIF dan relevan dengan divisi yg dipilih.
 *
 * Aturan:
 *   - Peran hanya muncul kalau salah satu divisi user match dengan
 *     daftar `divisions` di crm_role_columns.
 *   - 1 user bisa punya banyak alias per peran.
 */

import { useMemo, useState } from "react";
import { Plus, X, Tag, ListChecks, AlertCircle } from "lucide-react";
import { PilihDariDataDialog } from "./pilih-dari-data-dialog";

export type RoleColumn = {
  code: string;
  label: string;
  divisions: string[];
  excelColumnHint: string | null;
};

export type AliasState = Record<string, string[]>; // roleCode → list alias

export function AliasInputSection({
  roleColumns,
  selectedDivisionCodes,
  value,
  onChange,
  currentUserId,
}: {
  roleColumns: RoleColumn[];
  selectedDivisionCodes: string[];
  value: AliasState;
  onChange: (next: AliasState) => void;
  currentUserId?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState<string | null>(null); // roleCode

  // Filter peran: hanya yg relevant dengan divisi yg dipilih
  const relevantRoles = useMemo(() => {
    return roleColumns.filter((rc) =>
      rc.divisions.some((d) => selectedDivisionCodes.includes(d))
    );
  }, [roleColumns, selectedDivisionCodes]);

  if (relevantRoles.length === 0) {
    return (
      <div className="rounded-2xl bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
        <p className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-neutral-400" />
          Pilih divisi terkait CS / Advertiser / CRM / Live / Content untuk
          tambah alias nama di Excel.
        </p>
      </div>
    );
  }

  function addAlias(roleCode: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const existing = value[roleCode] ?? [];
    if (
      existing.some(
        (a) =>
          a.toLowerCase().trim().replace(/\s+/g, " ") ===
          trimmed.toLowerCase().trim().replace(/\s+/g, " ")
      )
    ) {
      return; // duplikat, skip
    }
    onChange({ ...value, [roleCode]: [...existing, trimmed] });
  }

  function removeAlias(roleCode: string, idx: number) {
    const existing = value[roleCode] ?? [];
    onChange({
      ...value,
      [roleCode]: existing.filter((_, i) => i !== idx),
    });
  }

  return (
    <>
      <div className="space-y-4">
        {relevantRoles.map((rc) => (
          <SingleRoleInput
            key={rc.code}
            role={rc}
            aliases={value[rc.code] ?? []}
            onAdd={(t) => addAlias(rc.code, t)}
            onRemove={(i) => removeAlias(rc.code, i)}
            onOpenPicker={() => setPickerOpen(rc.code)}
          />
        ))}
      </div>

      {pickerOpen && (
        <PilihDariDataDialog
          open={true}
          onClose={() => setPickerOpen(null)}
          roleCode={pickerOpen}
          roleLabel={
            relevantRoles.find((r) => r.code === pickerOpen)?.label ?? pickerOpen
          }
          currentUserId={currentUserId}
          existingAliases={value[pickerOpen] ?? []}
          onPick={(names) => {
            const existing = value[pickerOpen] ?? [];
            const seen = new Set(
              existing.map((a) =>
                a.toLowerCase().trim().replace(/\s+/g, " ")
              )
            );
            const toAdd = names.filter((n) => {
              const norm = n.toLowerCase().trim().replace(/\s+/g, " ");
              if (seen.has(norm)) return false;
              seen.add(norm);
              return true;
            });
            onChange({
              ...value,
              [pickerOpen]: [...existing, ...toAdd],
            });
          }}
        />
      )}
    </>
  );
}

function SingleRoleInput({
  role,
  aliases,
  onAdd,
  onRemove,
  onOpenPicker,
}: {
  role: RoleColumn;
  aliases: string[];
  onAdd: (text: string) => void;
  onRemove: (idx: number) => void;
  onOpenPicker: () => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  }

  return (
    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-neutral-500" />
          <p className="text-sm font-semibold text-neutral-900">
            Nama di kolom Excel: {role.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          <ListChecks className="h-3.5 w-3.5" />
          Pilih dari Data
        </button>
      </div>

      {role.excelColumnHint && (
        <p className="text-xs text-neutral-500">
          Biasanya kolom: &ldquo;{role.excelColumnHint}&rdquo;
        </p>
      )}

      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-900"
            >
              {a}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-blue-700 hover:text-red-600"
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Misal: ${role.label}.Budi, ${role.label} Budi, Budi`}
          className="h-10 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah
        </button>
      </div>
    </div>
  );
}
