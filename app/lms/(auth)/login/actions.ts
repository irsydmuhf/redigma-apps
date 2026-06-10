"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function lmsLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) {
    redirect("/lms/login?error=email-tidak-valid");
  }
  if (!password) {
    redirect("/lms/login?error=password-wajib");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/lms/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/lms/dashboard");
}
