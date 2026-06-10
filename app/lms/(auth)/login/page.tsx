import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TubesBackground } from "@/components/tubes-background";
import { lmsLogin } from "./actions";

function errorMsg(code: string | undefined) {
  if (!code) return null;
  if (code === "email-tidak-valid") return "Email tidak valid.";
  if (code === "password-wajib") return "Password wajib diisi.";
  if (code === "Invalid login credentials") return "Email atau password salah.";
  return code;
}

export default async function LmsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const { error, registered } = await searchParams;
  const msg = errorMsg(error);

  return (
    <TubesBackground>
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/40 bg-white/85 p-10 shadow-2xl backdrop-blur-xl">
          <div className="space-y-3 text-center">
            <Image
              src="/redigma-logo/wordmark-blue-yellow.png"
              alt="Redigma"
              width={220}
              height={70}
              priority
              className="mx-auto h-14 w-auto"
            />
            <p className="pt-1 text-sm font-medium text-neutral-700">
              ADV Onboarding
            </p>
            <p className="text-xs text-neutral-500">
              Login dengan email & password
            </p>
          </div>

          {registered && (
            <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
              Akun berhasil dibuat! Silakan login — akses konten belajar akan
              aktif setelah Manager menyetujui pendaftaran Anda.
            </div>
          )}

          <form action={lmsLogin} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-neutral-700"
              >
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nama@redigma.com"
                required
                autoComplete="email"
                className="h-12 rounded-2xl border-neutral-200 bg-white px-4 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-neutral-700"
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-12 rounded-2xl border-neutral-200 bg-white px-4 text-sm"
              />
            </div>

            {msg && (
              <p
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {msg}
              </p>
            )}

            <button
              type="submit"
              className="mesh-blue h-12 w-full rounded-2xl text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px"
            >
              Login
            </button>
          </form>

          <p className="text-center text-xs text-neutral-500">
            Belum punya akun?{" "}
            <span className="font-medium text-neutral-700">
              Minta invite link dari Manager Anda.
            </span>
          </p>

          <div className="border-t border-neutral-100 pt-4 text-center">
            <Link
              href="/dashboard"
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              ← Kembali ke Redigma Apps
            </Link>
          </div>
        </div>
      </main>
    </TubesBackground>
  );
}
