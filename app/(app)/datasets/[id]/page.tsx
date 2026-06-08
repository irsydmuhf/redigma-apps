import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Database } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ImportProgressCard } from "@/components/datasets/import-progress-card";
import { ExportButton } from "@/components/datasets/export-button";
import { DatasetToolbar } from "@/components/datasets/dataset-toolbar";
import { DatasetTable } from "@/components/datasets/dataset-table";
import { DatasetPagination } from "@/components/datasets/dataset-pagination";
import {
  parseViewState,
  type DatasetViewState,
} from "@/lib/datasets/url-state";
import {
  buildOrSearchString,
  buildValidSort,
  getSearchableColumns,
  isSafeIdent,
} from "@/lib/datasets/query-builder";

const SYSTEM_COLUMNS = new Set([
  "_id",
  "_import_job_id",
  "_imported_at",
  "_imported_by",
  "_source_file_url",
  "_deleted_at",
  "_row_hash",
  "_normalized_phone",
  "_normalized_email",
  "_normalized_sku",
  "_normalized_nik",
]);

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  // Extract job param sebelum parse view state (job bukan bagian dataset view)
  const jobParam = typeof sp.job === "string" ? sp.job : undefined;
  const view: DatasetViewState = parseViewState(sp);

  const supabase = await createClient();

  // Active import job (untuk progress card)
  let activeJobId: string | null = jobParam ?? null;
  if (!activeJobId) {
    const { data: latest } = await supabase
      .from("import_jobs")
      .select("id, status")
      .eq("dataset_id", id)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) activeJobId = latest.id as string;
  }

  // Dataset metadata (RLS-aware via server client)
  const { data: dataset } = await supabase
    .from("datasets")
    .select(
      "id, physical_table_name, display_name, description, division_code, created_at, divisions(name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!dataset) notFound();

  // Columns metadata
  const { data: columns } = await supabase
    .from("dataset_columns")
    .select("physical_column_name, display_name, data_type, position")
    .eq("dataset_id", id)
    .order("position");

  const allColumns = (columns ?? []).map((c) => ({
    physical_column_name: c.physical_column_name as string,
    display_name: c.display_name as string,
    data_type: c.data_type as string,
    position: c.position as number,
  }));

  const userColumns = allColumns.filter(
    (c) => !SYSTEM_COLUMNS.has(c.physical_column_name)
  );

  // === Build query untuk tabel dinamis ===
  // Pakai admin client untuk bypass RLS yang per-tabel — metadata access
  // sudah ter-validate via RLS pada `datasets` query di atas.
  const tableName = dataset.physical_table_name as string;
  if (!isSafeIdent(tableName)) {
    notFound();
  }

  const admin = createAdminClient();
  const searchable = getSearchableColumns(userColumns);
  const orSearch = buildOrSearchString(view.q, searchable);
  const validSort = buildValidSort(
    view.sort,
    new Set(allColumns.map((c) => c.physical_column_name))
  );

  const offset = (view.page - 1) * view.size;
  const limit = view.size;
  const userColumnNames = userColumns.map((c) => c.physical_column_name);

  // --- Data query ---
  let dataQuery = admin
    .from(tableName)
    .select(`_id,${userColumnNames.join(",")}`)
    .is("_deleted_at", null);

  if (view.q && view.col && isSafeIdent(view.col)) {
    dataQuery = dataQuery.ilike(
      view.col,
      `%${view.q.replace(/[%_]/g, " ")}%`
    );
  } else if (orSearch) {
    dataQuery = dataQuery.or(orSearch);
  }

  if (validSort.length === 0) {
    dataQuery = dataQuery.order("_imported_at", {
      ascending: false,
      nullsFirst: false,
    });
  } else {
    for (const s of validSort) {
      dataQuery = dataQuery.order(s.column, {
        ascending: s.direction === "asc",
        nullsFirst: false,
      });
    }
  }

  dataQuery = dataQuery.range(offset, offset + limit - 1);

  // --- Count query (paralel) ---
  let countQuery = admin
    .from(tableName)
    .select("_id", { count: "exact", head: true })
    .is("_deleted_at", null);

  if (view.q && view.col && isSafeIdent(view.col)) {
    countQuery = countQuery.ilike(
      view.col,
      `%${view.q.replace(/[%_]/g, " ")}%`
    );
  } else if (orSearch) {
    countQuery = countQuery.or(orSearch);
  }

  const [dataResult, countResult] = await Promise.all([
    dataQuery,
    countQuery,
  ]);

  const rows = dataResult.data ?? [];
  const rowsErr = dataResult.error;
  const totalCount = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / view.size));

  const div = Array.isArray(dataset.divisions)
    ? dataset.divisions[0]
    : dataset.divisions;

  const basePath = `/datasets/${id}`;

  return (
    <div className="space-y-6">
      <Link
        href="/datasets"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke daftar dataset
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="mesh-blue grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white">
            <Database className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl break-words">
              {dataset.display_name as string}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 break-words">
              {(div?.name as string) ?? (dataset.division_code as string)}
              {" · "}
              <code className="break-all rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                {tableName}
              </code>
            </p>
            {dataset.description && (
              <p className="mt-2 text-sm text-neutral-700 break-words">
                {dataset.description as string}
              </p>
            )}
          </div>
        </div>
        <ExportButton datasetId={id} />
      </div>

      {activeJobId && <ImportProgressCard importJobId={activeJobId} />}

      {rowsErr ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
          Gagal membaca data: {rowsErr.message}
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
          <DatasetToolbar
            basePath={basePath}
            state={view}
            columns={userColumns}
            totalCount={totalCount}
            shownCount={rows.length}
          />
          <DatasetTable
            basePath={basePath}
            state={view}
            columns={userColumns}
            rows={rows as unknown as Record<string, unknown>[]}
          />
          <DatasetPagination
            basePath={basePath}
            state={view}
            totalCount={totalCount}
            totalPages={totalPages}
            shownCount={rows.length}
          />
        </div>
      )}
    </div>
  );
}
