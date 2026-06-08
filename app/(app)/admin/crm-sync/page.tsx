import Link from "next/link";
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Settings,
  Sparkles,
  History,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { RebuildAllButton } from "./rebuild-all-button";

export default async function CrmSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  // Get all datasets with their mapping & last sync log
  const { data: datasets } = await admin
    .from("datasets")
    .select(
      "id, physical_table_name, display_name, division_code, created_at, divisions(name)"
    )
    .order("created_at", { ascending: false });

  const datasetIds = (datasets ?? []).map((d) => d.id as string);

  const { data: mappings } = datasetIds.length
    ? await admin
        .from("crm_dataset_mappings")
        .select("dataset_id, target_table, is_active")
        .in("dataset_id", datasetIds)
    : { data: [] };

  const { data: lastSyncs } = datasetIds.length
    ? await admin
        .from("crm_sync_log")
        .select(
          "dataset_id, status, mode, rows_inserted, rows_updated, run_at, error_summary"
        )
        .in("dataset_id", datasetIds)
        .order("run_at", { ascending: false })
    : { data: [] };

  const mappingMap = new Map<string, { target_table: string; is_active: boolean }[]>();
  for (const m of mappings ?? []) {
    const arr = mappingMap.get(m.dataset_id as string) ?? [];
    arr.push({
      target_table: m.target_table as string,
      is_active: m.is_active as boolean,
    });
    mappingMap.set(m.dataset_id as string, arr);
  }

  type SyncLog = NonNullable<typeof lastSyncs>[number];
  const lastSyncMap = new Map<string, SyncLog>();
  for (const s of lastSyncs ?? []) {
    if (!lastSyncMap.has(s.dataset_id as string)) {
      lastSyncMap.set(s.dataset_id as string, s);
    }
  }

  // Count totals for stats cards
  const { count: customerCount } = await admin
    .from("crm_customers")
    .select("id", { count: "exact", head: true });
  const { count: transactionCount } = await admin
    .from("crm_transactions")
    .select("id", { count: "exact", head: true });
  const { count: mappingCount } = await admin
    .from("crm_dataset_mappings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            CRM Sync
          </h1>
          <p className="text-sm text-neutral-600">
            Atur mapping kolom CSV → tabel master CRM. Sync otomatis saat upload
            sukses, atau manual lewat tombol di bawah.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/crm-sync/log"
            className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <History className="h-4 w-4" />
            Log Sync
          </Link>
          <RebuildAllButton />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Database className="h-5 w-5" />}
          label="Total Customer di CRM"
          value={(customerCount ?? 0).toLocaleString("id-ID")}
          tone="blue"
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Total Transaksi"
          value={(transactionCount ?? 0).toLocaleString("id-ID")}
          tone="green"
        />
        <StatCard
          icon={<Settings className="h-5 w-5" />}
          label="Mapping Aktif"
          value={(mappingCount ?? 0).toLocaleString("id-ID")}
          tone="purple"
        />
      </div>

      <div className="rounded-3xl border border-neutral-100 bg-white">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-900">
            Datasets ({(datasets ?? []).length})
          </h2>
          <p className="text-sm text-neutral-600">
            Klik &ldquo;Atur Mapping&rdquo; untuk konfigurasi kolom CSV mana
            yang masuk ke tabel master mana.
          </p>
        </div>

        <div className="divide-y divide-neutral-100">
          {(datasets ?? []).length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-neutral-500">
              Belum ada dataset. Upload CSV dulu di halaman Upload.
            </p>
          ) : (
            (datasets ?? []).map((ds) => {
              const dsMappings = mappingMap.get(ds.id as string) ?? [];
              const lastSync = lastSyncMap.get(ds.id as string);
              const div = Array.isArray(ds.divisions)
                ? ds.divisions[0]
                : ds.divisions;

              return (
                <div
                  key={ds.id as string}
                  className="flex flex-wrap items-center gap-4 px-6 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/crm-sync/${ds.id}`}
                      className="font-semibold text-neutral-900 hover:underline"
                    >
                      {ds.display_name as string}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {(div?.name as string) ?? (ds.division_code as string)} ·{" "}
                      <code className="rounded bg-neutral-100 px-1 py-0.5">
                        {ds.physical_table_name as string}
                      </code>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {dsMappings.length === 0 ? (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-500">
                          Belum di-mapping
                        </span>
                      ) : (
                        dsMappings.map((m) => (
                          <span
                            key={m.target_table}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              m.is_active
                                ? "bg-green-50 text-green-700"
                                : "bg-neutral-100 text-neutral-500"
                            }`}
                          >
                            → {m.target_table}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    {lastSync ? (
                      <>
                        <p
                          className={`inline-flex items-center gap-1 font-medium ${
                            lastSync.status === "success"
                              ? "text-green-700"
                              : "text-red-700"
                          }`}
                        >
                          {lastSync.status === "success" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {lastSync.status === "success"
                            ? `${(lastSync.rows_inserted ?? 0).toLocaleString("id-ID")} insert, ${(lastSync.rows_updated ?? 0).toLocaleString("id-ID")} update`
                            : "Gagal"}
                        </p>
                        <p className="text-neutral-500">
                          {new Date(lastSync.run_at as string).toLocaleString(
                            "id-ID",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}{" "}
                          · {lastSync.mode as string}
                        </p>
                      </>
                    ) : (
                      <p className="text-neutral-400">Belum pernah sync</p>
                    )}
                  </div>

                  <Link
                    href={`/admin/crm-sync/${ds.id}`}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    <Settings className="h-3 w-3" />
                    Atur Mapping
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "purple";
}) {
  const mesh = {
    blue: "mesh-blue",
    green: "mesh-green",
    purple: "mesh-purple",
  }[tone];

  return (
    <div className={`${mesh} rounded-3xl p-6 text-white`}>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/20 p-2.5">{icon}</div>
        <div>
          <p className="text-sm font-medium text-white/80">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}
