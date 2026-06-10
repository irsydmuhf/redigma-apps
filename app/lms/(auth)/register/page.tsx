import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TubesBackground } from "@/components/tubes-background";
import { lmsRegister, lmsJoinProgram } from "./actions";
import { getCurrentLmsUser } from "@/lib/lms/current-user";

function errorMsg(code: string | undefined) {
  if (!code) return null;
  const map: Record<string, string> = {
    "nama-wajib": "Nama lengkap wajib diisi.",
    "email-tidak-valid": "Format email tidak valid.",
    "password-min-8": "Password minimal 8 karakter.",
    "email-sudah-dipakai": "Email sudah terdaftar. Silakan login.",
    "link-tidak-valid": "Invite link tidak valid atau sudah dinonaktifkan.",
    "link-kadaluarsa": "Invite link sudah kadaluarsa. Minta link baru ke Manager.",
  };
  return map[code] ?? decodeURIComponent(code);
}

export default async function LmsRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const msg = errorMsg(error);

  if (!token) {
    return (
      <TubesBackground>
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/40 bg-white/85 p-10 shadow-2xl backdrop-blur-xl text-center space-y-4">
            <p className="text-sm font-medium text-neutral-700">
              Link tidak valid.
            </p>
            <p className="text-xs text-neutral-500">
              Minta invite link dari Manager Anda untuk mendaftar.
            </p>
          </div>
        </main>
      </TubesBackground>
    );
  }

  // Cek apakah user sudah login
  const currentUser = await getCurrentLmsUser();

  // Ambil info program dari token
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("lms_invite_links")
    .select("id, is_active, expires_at, program_id, lms_programs(name, description)")
    .eq("token", token)
    .single();

  const isExpired =
    link?.expires_at && new Date(link.expires_at) < new Date();
  const isInvalid = !link || !link.is_active || isExpired;

  const program = link && !isInvalid
    ? (Array.isArray(link.lms_programs)
        ? link.lms_programs[0]
        : link.lms_programs)
    : null;

  return (
    <TubesBackground>
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
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
              Daftar Program Onboarding
            </p>
          </div>

          {isInvalid ? (
            <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm text-red-700 text-center space-y-1">
              <p className="font-medium">
                {isExpired ? "Invite link kadaluarsa." : "Invite link tidak valid."}
              </p>
              <p className="text-xs">Hubungi Manager Anda untuk mendapatkan link baru.</p>
            </div>
          ) : (
            <>
              {program && (
                <div className="rounded-2xl bg-neutral-50 px-4 py-3 space-y-1">
                  <p className="text-xs text-neutral-500">Program yang akan diikuti</p>
                  <p className="text-sm font-semibold text-neutral-900">{program.name}</p>
                  {program.description && (
                    <p className="text-xs text-neutral-600">{program.description}</p>
                  )}
                </div>
              )}

              {/* User sudah login — tampilkan tombol langsung join */}
              {currentUser ? (
                <form action={lmsJoinProgram} className="space-y-4">
                  <input type="hidden" name="token" value={token} />
                  <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Anda login sebagai <span className="font-semibold">{currentUser.fullName}</span>.
                    Klik di bawah untuk mendaftar ke program ini.
                  </div>
                  {msg && (
                    <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      {msg}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="mesh-blue h-12 w-full rounded-2xl text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px"
                  >
                    Daftar ke Program Ini
                  </button>
                </form>
              ) : (
                /* User belum login — tampilkan form register */
                <form action={lmsRegister} className="space-y-5">
                  <input type="hidden" name="token" value={token} />

                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-sm font-medium text-neutral-700">
                      Nama Lengkap
                    </Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      placeholder="Nama sesuai data karyawan"
                      required
                      className="h-12 rounded-2xl border-neutral-200 bg-white px-4 text-sm"
                    />
                  </div>

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
                      placeholder="Minimal 8 karakter"
                      required
                      autoComplete="new-password"
                      className="h-12 rounded-2xl border-neutral-200 bg-white px-4 text-sm"
                    />
                  </div>

                  {msg && (
                    <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      {msg}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="mesh-blue h-12 w-full rounded-2xl text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px"
                  >
                    Daftar Sekarang
                  </button>

                  <p className="text-center text-xs text-neutral-500">
                    Setelah mendaftar, akses konten akan aktif setelah Manager menyetujui.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </TubesBackground>
  );
}
