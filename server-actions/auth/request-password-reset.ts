"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type Result =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Kirim email reset password ke user yang sedang login.
 * User klik link di email → diarahkan ke /auth/ubah-password untuk
 * set password baru.
 */
export async function requestPasswordReset(): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Anda harus login dulu." };
  }

  // Tentukan base URL untuk redirect link di email
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? `${protocol}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    // Lewat callback supaya session di-exchange dulu, baru ke halaman form
    redirectTo: `${baseUrl}/auth/callback?next=/auth/ubah-password`,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
