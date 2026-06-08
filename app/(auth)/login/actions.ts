"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function kirimMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    redirect("/login?error=email-tidak-valid");
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/cek-email?email=${encodeURIComponent(email)}`);
}

export async function loginPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) {
    redirect("/login?mode=password&error=email-tidak-valid");
  }
  if (!password) {
    redirect("/login?mode=password&error=password-wajib");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      `/login?mode=password&error=${encodeURIComponent(error.message)}`
    );
  }

  redirect("/dashboard");
}
