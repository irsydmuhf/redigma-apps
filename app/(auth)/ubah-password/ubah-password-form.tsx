"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "./actions";

export function UbahPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    startTransition(async () => {
      const res = await updatePassword(password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Sukses → redirect dengan flag ok=1
      router.push("/auth/ubah-password?ok=1");
      router.refresh();
      setTimeout(() => router.push("/dashboard"), 2000);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Password Baru</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 karakter"
            required
            minLength={6}
            className="h-12 rounded-2xl pr-12"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            aria-label={show ? "Sembunyikan" : "Tampilkan"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Konfirmasi Password Baru</Label>
        <Input
          id="confirm"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ulangi password"
          required
          className="h-12 rounded-2xl"
        />
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mesh-blue h-12 w-full rounded-2xl text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px disabled:opacity-50"
      >
        {pending ? "Menyimpan..." : "Simpan Password Baru"}
      </button>
    </form>
  );
}
