"use client";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "raw-imports";

/**
 * Upload raw file langsung dari browser ke Supabase Storage.
 *
 * Kenapa client-side (bukan Server Action)?
 * - Server Action di Next.js punya body size limit default 1MB
 * - File besar (5MB+) bakal kena error "Unexpected end of form"
 * - Browser → Storage direct upload bypass Server Action entirely
 * - RLS policy `raw_imports_authenticated_insert` sudah izinkan authenticated insert
 *
 * Return: path di storage (untuk disimpan di import_jobs.source_file_url).
 */
export async function uploadRawFileClient(
  tempId: string,
  file: File
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${tempId}/${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, path };
}
