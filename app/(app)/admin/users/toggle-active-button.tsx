"use client";

import { useTransition } from "react";
import { toggleUserActive } from "@/server-actions/admin/toggle-user-active";

export function ToggleActiveButton({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handle() {
    const action = isActive ? "menonaktifkan" : "mengaktifkan kembali";
    if (!confirm(`Yakin ${action} user ini?`)) return;

    startTransition(async () => {
      const res = await toggleUserActive({ userId, isActive: !isActive });
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
    >
      {pending ? "Menyimpan..." : isActive ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
