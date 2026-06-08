"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

type Result =
  | { ok: true; rowsAffected: number }
  | { ok: false; error: string };

export async function rollbackImport(importJobId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rollback_import", {
    p_import_job_id: importJobId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/riwayat");
  revalidatePath("/trash");
  revalidatePath("/datasets");

  return { ok: true, rowsAffected: (data as number) ?? 0 };
}

export async function restoreImport(importJobId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_import", {
    p_import_job_id: importJobId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/riwayat");
  revalidatePath("/trash");
  revalidatePath("/datasets");

  return { ok: true, rowsAffected: (data as number) ?? 0 };
}

export async function permanentDeleteImport(
  importJobId: string
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };
  if (!user.isAdmin) return { ok: false, error: "Hanya admin." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("permanent_delete_import", {
    p_import_job_id: importJobId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/trash");

  return { ok: true, rowsAffected: (data as number) ?? 0 };
}
