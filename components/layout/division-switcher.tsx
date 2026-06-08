"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Check, ChevronDown, Building2 } from "lucide-react";
import { setActiveDivision } from "@/server-actions/set-active-division";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import type { Role } from "@/lib/auth/current-user";

type Division = {
  divisionCode: string;
  divisionName: string;
  role: Role;
};

export function DivisionSwitcher({
  divisions,
  activeDivisionCode,
}: {
  divisions: Division[];
  activeDivisionCode: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (divisions.length <= 1) {
    const only = divisions[0];
    if (!only) return null;
    return (
      <div className="flex items-center gap-2 rounded-full bg-neutral-50 px-4 py-2 text-sm">
        <Building2 className="h-4 w-4 text-neutral-500" />
        <span className="font-medium text-neutral-900">
          {only.divisionName}
        </span>
        <span className="text-xs text-neutral-500">
          · {ROLE_LABEL[only.role]}
        </span>
      </div>
    );
  }

  const active = divisions.find((d) => d.divisionCode === activeDivisionCode);

  function pick(code: string) {
    startTransition(async () => {
      await setActiveDivision(code);
      setOpen(false);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="flex items-center gap-2 rounded-full bg-neutral-50 px-4 py-2 text-sm transition hover:bg-neutral-100 disabled:opacity-50"
      >
        <Building2 className="h-4 w-4 text-neutral-500" />
        <span className="font-medium text-neutral-900">
          {active?.divisionName ?? "Pilih divisi"}
        </span>
        {active && (
          <span className="text-xs text-neutral-500">
            · {ROLE_LABEL[active.role]}
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-neutral-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-xl">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Pilih divisi aktif
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {divisions.map((d) => {
              const isActive = d.divisionCode === activeDivisionCode;
              return (
                <li key={d.divisionCode}>
                  <button
                    type="button"
                    onClick={() => pick(d.divisionCode)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-neutral-50"
                  >
                    <span>
                      <span className="block font-medium text-neutral-900">
                        {d.divisionName}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {ROLE_LABEL[d.role]}
                      </span>
                    </span>
                    {isActive && (
                      <Check className="h-4 w-4 text-neutral-700" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
