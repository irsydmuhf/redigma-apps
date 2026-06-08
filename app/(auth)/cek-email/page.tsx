import { Mail } from "lucide-react";
import Link from "next/link";

export default async function CekEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <main className="mesh-soft flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-white/40 bg-white/80 p-10 text-center shadow-xl backdrop-blur-xl">
        <div className="mesh-green mx-auto grid h-14 w-14 place-items-center rounded-3xl text-white shadow-lg">
          <Mail className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-900">
            Cek email Anda
          </h1>
          <p className="text-sm text-neutral-600">
            Kami sudah mengirim link login ke
          </p>
          {email && (
            <p className="rounded-2xl bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-900">
              {email}
            </p>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Buka email tersebut dan klik tombol login. Link berlaku selama 1 jam.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
        >
          Kembali ke halaman login
        </Link>
      </div>
    </main>
  );
}
