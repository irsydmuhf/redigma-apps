"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function lmsRegister(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName) redirect(`/lms/register?token=${token}&error=nama-wajib`);
  if (!email || !email.includes("@"))
    redirect(`/lms/register?token=${token}&error=email-tidak-valid`);
  if (password.length < 8)
    redirect(`/lms/register?token=${token}&error=password-min-8`);

  const admin = createAdminClient();

  // Validasi invite link
  const { data: link } = await admin
    .from("lms_invite_links")
    .select("id, program_id, expires_at, is_active")
    .eq("token", token)
    .single();

  if (!link || !link.is_active) {
    redirect(`/lms/register?token=${token}&error=link-tidak-valid`);
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    redirect(`/lms/register?token=${token}&error=link-kadaluarsa`);
  }

  // Buat auth user (auto-confirm, tanpa kirim email verifikasi)
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (authError) {
    const code =
      authError.message.includes("already registered")
        ? "email-sudah-dipakai"
        : encodeURIComponent(authError.message);
    redirect(`/lms/register?token=${token}&error=${code}`);
  }

  const userId = authData.user.id;

  // Buat profil LMS
  await admin.from("lms_user_profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    role: "adv",
  });

  // Buat enrollment (pending — menunggu approval Manager)
  await admin.from("lms_program_enrollments").insert({
    user_id: userId,
    program_id: link.program_id,
    status: "pending",
  });

  redirect("/lms/login?registered=true");
}
