"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type FileHashCheckResult = {
  exists: boolean;
  existingJob?: {
    id: string;
    fileName: string | null;
    datasetId: string | null;
    datasetDisplayName: string | null;
    createdAt: string;
    createdByEmail: string | null;
  };
};

/**
 * Cek apakah file dengan hash ini sudah pernah di-upload sebelumnya.
 * Pakai untuk warning "file ini sudah di-upload pada tanggal X oleh Y".
 */
export async function checkFileHash(
  fileHash: string
): Promise<FileHashCheckResult> {
  const user = await getCurrentUser();
  if (!user) return { exists: false };

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select(
      "id, file_name, dataset_id, created_at, status, datasets(display_name), user_profiles!created_by(email)"
    )
    .eq("file_hash", fileHash)
    .in("status", ["done", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return { exists: false };

  const ds = Array.isArray(job.datasets) ? job.datasets[0] : job.datasets;
  const up = Array.isArray(job.user_profiles)
    ? job.user_profiles[0]
    : job.user_profiles;

  return {
    exists: true,
    existingJob: {
      id: job.id as string,
      fileName: job.file_name as string | null,
      datasetId: job.dataset_id as string | null,
      datasetDisplayName: (ds?.display_name as string) ?? null,
      createdAt: job.created_at as string,
      createdByEmail: (up?.email as string) ?? null,
    },
  };
}
