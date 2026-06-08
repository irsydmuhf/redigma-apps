"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag, Loader2 } from "lucide-react";
import {
  toggleRoleColumn,
  updateRoleColumnLabel,
} from "@/server-actions/admin/alias-actions";

type Item = {
  code: string;
  label: string;
  divisions: string[];
  excelColumnHint: string;
  isActive: boolean;
};

export function RoleColumnsManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; hint: string }>({
    label: "",
    hint: "",
  });

  function handleToggle(code: string, isActive: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await toggleRoleColumn({ code, isActive });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function startEdit(item: Item) {
    setEditing(item.code);
    setDraft({ label: item.label, hint: item.excelColumnHint });
  }

  function saveEdit(code: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateRoleColumnLabel({
        code,
        label: draft.label,
        excelColumnHint: draft.hint,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {items.map((item) => (
        <div
          key={item.code}
          className="rounded-3xl border border-neutral-100 bg-white p-5"
        >
          <div className="flex items-start gap-4">
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                item.isActive
                  ? "mesh-blue text-white"
                  : "bg-neutral-100 text-neutral-400"
              }`}
            >
              <Tag className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              {editing === item.code ? (
                <div className="space-y-2">
                  <input
                    value={draft.label}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, label: e.target.value }))
                    }
                    placeholder="Nama peran"
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                  />
                  <input
                    value={draft.hint}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, hint: e.target.value }))
                    }
                    placeholder="Petunjuk kolom Excel"
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(item.code)}
                      disabled={pending}
                      className="h-9 rounded-xl bg-neutral-900 px-4 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Simpan
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="h-9 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold text-neutral-900">
                      {item.label}
                    </p>
                    <code className="text-xs text-neutral-500">
                      {item.code}
                    </code>
                  </div>
                  {item.excelColumnHint && (
                    <p className="text-xs text-neutral-600">
                      Petunjuk kolom: &ldquo;{item.excelColumnHint}&rdquo;
                    </p>
                  )}
                  {item.divisions.length > 0 && (
                    <p className="text-xs text-neutral-500">
                      Divisi:{" "}
                      {item.divisions.map((d) => (
                        <code
                          key={d}
                          className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5"
                        >
                          {d}
                        </code>
                      ))}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {editing !== item.code && (
                <button
                  onClick={() => startEdit(item)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => handleToggle(item.code, !item.isActive)}
                disabled={pending}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold transition disabled:opacity-50 ${
                  item.isActive
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                {item.isActive ? "Aktif" : "Nonaktif"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
