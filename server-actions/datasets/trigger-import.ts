"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Invoke Edge Function process-import.
 *
 * Pakai await dengan timeout pendek (5 detik) — kalau edge function tidak
 * ada / tidak respon, error langsung ditampilkan ke user.
 *
 * Edge function-nya sendiri (yang sudah ke-trigger) tetap jalan di background
 * — kita cuma tunggu konfirmasi "received".
 */
export async function triggerImport(
  importJobId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const admin = createAdminClient();

  try {
    // Timeout 5 detik supaya UI tidak hang kalau edge function tidak ada
    const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            error: new Error(
              "Edge Function tidak respon dalam 5 detik. Pastikan function 'process-import' sudah di-deploy ke Supabase. Lihat supabase/functions/process-import/README.md."
            ),
          }),
        5000
      )
    );

    const invokePromise = admin.functions.invoke("process-import", {
      body: { importJobId },
    });

    const result = await Promise.race([invokePromise, timeoutPromise]);

    if ("error" in result && result.error) {
      // Mark job sebagai failed supaya tidak stuck di queued forever
      await admin
        .from("import_jobs")
        .update({
          status: "failed",
          error_summary: { error: result.error.message },
          completed_at: new Date().toISOString(),
        })
        .eq("id", importJobId);

      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("import_jobs")
      .update({
        status: "failed",
        error_summary: { error: msg },
        completed_at: new Date().toISOString(),
      })
      .eq("id", importJobId);
    return { ok: false, error: msg };
  }
}
