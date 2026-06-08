"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  findDatasetMatches,
  type DatasetMatch,
} from "@/lib/schema/smart-match";

/**
 * Cari dataset existing di divisi yang struktur kolomnya cocok dengan CSV.
 * Return list match (similarity >= 0.8), sorted by similarity desc.
 */
export async function getDatasetMatches(
  divisionCode: string,
  csvPhysicalNames: string[]
): Promise<DatasetMatch[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const allowed =
    user.isAdmin ||
    user.divisions.some((d) => d.divisionCode === divisionCode);
  if (!allowed) return [];

  const supabase = await createClient();
  const { data: datasets } = await supabase
    .from("datasets")
    .select(
      "id, display_name, physical_table_name, division_code, dataset_columns(physical_column_name, display_name, data_type)"
    )
    .eq("division_code", divisionCode);

  if (!datasets) return [];

  const candidates = datasets.map((d) => ({
    id: d.id as string,
    displayName: d.display_name as string,
    physicalTableName: d.physical_table_name as string,
    divisionCode: d.division_code as string,
    columns: (d.dataset_columns ?? []).map((c) => ({
      physicalName: c.physical_column_name as string,
      displayName: c.display_name as string,
      dataType: c.data_type as string,
    })),
  }));

  return findDatasetMatches(csvPhysicalNames, candidates, 0.8);
}
