import Link from "next/link";
import Image from "next/image";
import { TubesBackground } from "@/components/tubes-background";
import { UbahPasswordForm } from "./ubah-password-form";

export default async function UbahPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;

  return (
    <TubesBackground>
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 rounded-3xl border border-white/40 bg-white/90 p-10 shadow-2xl backdrop-blur-xl">
          <div className="space-y-3 text-center">
            <Image
              src="/redigma-logo/wordmark-blue-yellow.png"
              alt="Redigma"
              width={220}
              height={70}
              priority
              className="mx-auto h-14 w-auto"
            />
            <h1 className="text-xl font-bold text-neutral-900">
              Ubah Password
            </h1>
            <p className="text-sm text-neutral-600">
              Masukkan password baru Anda.
            </p>
          </div>

          {ok === "1" && (
            <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
              ✓ Password berhasil diubah. Anda akan diarahkan ke dashboard.
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {decodeURIComponent(error)}
            </div>
          )}

          {ok !== "1" && <UbahPasswordForm />}

          <div className="text-center">
            <Link
              href="/dashboard"
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              ← Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </main>
    </TubesBackground>
  );
}
