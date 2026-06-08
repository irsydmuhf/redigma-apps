"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function syncDatasetToCrm(
  datasetId: string,
  mode: "manual" | "rebuild_all" = "manual"
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_crm_dataset", {
    p_dataset_id: datasetId,
    p_mode: mode,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/crm-sync");
  return { ok: true, data: data as Record<string, unknown> };
}

export async function rebuildAllCrm(): Promise<Result> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, error: "Hanya admin." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rebuild_all_crm");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/crm-sync");
  return { ok: true, data: data as Record<string, unknown> };
}

export type ColumnMap = Record<string, string>;

export async function saveMapping(input: {
  datasetId: string;
  targetTable: "crm_customers" | "crm_transactions";
  columnMap: ColumnMap;
  isActive: boolean;
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const allowed =
    user.isAdmin ||
    user.divisions.some(
      (d) =>
        ["crm", "crm_b2b", "cs", "data_it"].includes(d.divisionCode) &&
        ["spv", "head"].includes(d.role)
    );
  if (!allowed) return { ok: false, error: "Tidak punya akses." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_dataset_mappings")
    .upsert(
      {
        dataset_id: input.datasetId,
        target_table: input.targetTable,
        column_map: input.columnMap,
        is_active: input.isActive,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dataset_id,target_table" }
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/crm-sync");
  revalidatePath(`/admin/crm-sync/${input.datasetId}`);
  return { ok: true, data: data as Record<string, unknown> };
}

export async function deleteMapping(input: {
  datasetId: string;
  targetTable: "crm_customers" | "crm_transactions";
}): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Belum login." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_dataset_mappings")
    .delete()
    .eq("dataset_id", input.datasetId)
    .eq("target_table", input.targetTable);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/crm-sync");
  return { ok: true, data: {} };
}
