import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** URL absolut untuk link di email (butuh NEXT_PUBLIC_APP_URL agar berfungsi). */
export function lmsUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Kirim email transaksional via Resend.
 * Env-gated: jika RESEND_API_KEY belum diset, fungsi no-op (tidak error),
 * jadi aman dijalankan sebelum email dikonfigurasi.
 *
 * Setup: set env RESEND_API_KEY (dan opsional LMS_EMAIL_FROM, mis.
 * "Redigma LMS <noreply@domainmu.com>" — domain harus diverifikasi di Resend).
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const from = process.env.LMS_EMAIL_FROM ?? "Redigma LMS <onboarding@resend.dev>";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("Resend gagal:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("Resend error:", e);
  }
}

/** Cari email user lalu kirim. No-op bila email belum dikonfigurasi. */
export async function sendEmailToUser(
  userId: string,
  subject: string,
  html: string
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("lms_user_profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (data?.email) await sendEmail({ to: data.email as string, subject, html });
}

/** Template email sederhana ber-branding Redigma. */
export function emailShell(
  heading: string,
  bodyHtml: string,
  cta?: { label: string; url: string }
): string {
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#07569d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;font-size:14px">${cta.label}</a>`
    : "";
  return `
  <div style="background:#f6f9fc;padding:32px 0;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #eef2f7">
      <div style="font-size:20px;font-weight:700;color:#07569d;margin-bottom:4px">Re<span style="color:#ffc700">.</span>digma <span style="font-size:12px;color:#6b7280">LMS</span></div>
      <h1 style="font-size:18px;color:#111827;margin:16px 0 8px">${heading}</h1>
      <div style="font-size:14px;line-height:1.6;color:#374151">${bodyHtml}</div>
      ${button}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px">Email otomatis dari Redigma LMS · mohon tidak membalas.</p>
  </div>`;
}
