"use client";

import { useState, useTransition } from "react";
import { Mail, Check } from "lucide-react";
import { requestPasswordReset } from "@/server-actions/auth/request-password-reset";

export function UbahPasswordButton() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Link sudah dikirim ke email Anda.</p>
          <p className="mt-1 text-xs">
            Cek inbox (atau folder spam). Klik link di email untuk set password
            baru. Link berlaku 1 jam.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mesh-blue inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        {pending ? "Mengirim link..." : "Kirim Link Ubah Password ke Email"}
      </button>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
