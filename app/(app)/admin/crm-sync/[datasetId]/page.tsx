import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { MappingEditor } from "./mapping-editor";

export default async function CrmSyncDatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: dataset } = await admin
    .from("datasets")
    .select("id, display_name, physical_table_name, division_code, divisions(name)")
    .eq("id", datasetId)
    .maybeSingle();

  if (!dataset) notFound();

  const { data: columns } = await admin
    .from("dataset_columns")
    .select("physical_column_name, display_name, data_type")
    .eq("dataset_id", datasetId)
    .order("position");

  const { data: existingMappings } = await admin
    .from("crm_dataset_mappings")
    .select("target_table, column_map, is_active")
    .eq("dataset_id", datasetId);

  const sourceColumns = (columns ?? []).map((c) => ({
    physical: c.physical_column_name as string,
    display: c.display_name as string,
    type: c.data_type as string,
  }));

  const customerMapping = existingMappings?.find(
    (m) => m.target_table === "crm_customers"
  );
  const transactionMapping = existingMappings?.find(
    (m) => m.target_table === "crm_transactions"
  );

  const div = Array.isArray(dataset.divisions)
    ? dataset.divisions[0]
    : dataset.divisions;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/crm-sync"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke daftar
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          {dataset.display_name as string}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {(div?.name as string) ?? (dataset.division_code as string)} ·{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
            {dataset.physical_table_name as string}
          </code>
        </p>
      </div>

      <MappingEditor
        datasetId={datasetId}
        sourceColumns={sourceColumns}
        existingCustomerMapping={
          customerMapping
            ? {
                columnMap: customerMapping.column_map as Record<string, string>,
                isActive: customerMapping.is_active as boolean,
              }
            : null
        }
        existingTransactionMapping={
          transactionMapping
            ? {
                columnMap: transactionMapping.column_map as Record<string, string>,
                isActive: transactionMapping.is_active as boolean,
              }
            : null
        }
      />
    </div>
  );
}
