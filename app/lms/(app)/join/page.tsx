import { joinProgram } from "./actions";
import { Key, ChevronLeft } from "lucide-react";
import Link from "next/link";

const ERROR_MSG: Record<string, string> = {
  "token-kosong": "Token tidak boleh kosong.",
  "token-tidak-valid": "Token tidak valid atau sudah dinonaktifkan. Minta token baru ke Manager.",
  "token-kadaluarsa": "Token sudah kadaluarsa. Minta token baru ke Manager.",
  "sudah-aktif": "Kamu sudah aktif di program ini.",
  "sudah-menunggu": "Pendaftaranmu ke program ini sedang menunggu persetujuan Manager.",
};

export default async function JoinProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const msg = error ? (ERROR_MSG[error] ?? decodeURIComponent(error)) : null;

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/lms/programs" className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700">
        <ChevronLeft className="h-4 w-4" /> Program Saya
      </Link>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Ikuti Program
        </h1>
        <p className="text-sm text-neutral-600">
          Masukkan token yang dibagikan Manager untuk mendaftar ke program onboarding.
        </p>
      </div>

      <div className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-4">
          <Key className="h-5 w-5 text-neutral-400 shrink-0" />
          <p className="text-xs text-neutral-600">
            Minta token ke Manager atau Admin. Token berupa kode unik yang bisa dicopy dari halaman invite link program.
          </p>
        </div>

        <form action={joinProgram} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700" htmlFor="token">
              Token Program
            </label>
            <input
              id="token"
              name="token"
              required
              placeholder="Paste token di sini…"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 font-mono text-sm outline-none focus:border-neutral-400"
            />
          </div>

          {msg && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {msg}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            Daftar ke Program
          </button>
        </form>
      </div>
    </div>
  );
}
