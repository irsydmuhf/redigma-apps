"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "raw-imports";

/**
 * Upload raw file (binary) ke Supabase Storage bucket `raw-imports`.
 * Path: `{importJobId}/{fileName}` agar mudah trace per import job.
 *
 * Pakai admin client supaya bypass RLS untuk operasi internal yang
 * sudah divalidasi di sini.
 *
 * Return: path di storage (untuk disimpan di import_jobs.source_file_url).
 */
export async function uploadRawFile(
  importJobId: string,
  fileName: string,
  fileData: ArrayBuffer | Uint8Array
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${importJobId}/${safeName}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, fileData as ArrayBuffer, {
      contentType: "application/octet-stream",
      upsert: false,
    });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, path };
}
