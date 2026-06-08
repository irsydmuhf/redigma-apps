import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TubesBackground } from "@/components/tubes-background";
import { kirimMagicLink, loginPassword } from "./actions";

function errorMessage(code: string | undefined) {
  if (!code) return null;
  if (code === "email-tidak-valid") return "Email tidak valid.";
  if (code === "password-wajib") return "Password wajib diisi.";
  return code;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const { error, mode } = await searchParams;
  const isPassword = mode === "password";
  const msg = errorMessage(error);

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
          <p className="pt-2 text-sm text-neutral-600">
            {isPassword
              ? "Login dengan email & password"
              : "Masuk dengan email kantor Anda"}
          </p>
        </div>

        {isPassword ? (
          <form action={loginPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
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
              <Label htmlFor="password" className="text-sm font-medium text-neutral-700">
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

            <p className="text-center text-xs text-neutral-500">
              <Link
                href="/login"
                className="font-medium text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
              >
                ← Gunakan magic link
              </Link>
            </p>
          </form>
        ) : (
          <form action={kirimMagicLink} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-neutral-700">
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
              Kirim Link Login
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-neutral-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-neutral-500">atau</span>
              </div>
            </div>

            <Link
              href="/login?mode=password"
              className="block h-12 rounded-2xl border border-neutral-200 bg-white text-center text-sm font-semibold leading-[3rem] text-neutral-700 transition hover:bg-neutral-50"
            >
              Login dengan Password
            </Link>

            <p className="text-center text-xs text-neutral-500">
              Anda akan menerima link login di email. Klik link untuk masuk.
            </p>
          </form>
        )}
        </div>
      </main>
    </TubesBackground>
  );
}
