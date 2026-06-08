"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Play, Trash2, Users, Receipt } from "lucide-react";
import {
  saveMapping,
  deleteMapping,
  syncDatasetToCrm,
  type ColumnMap,
} from "@/server-actions/crm-sync/sync-actions";

type SourceColumn = { physical: string; display: string; type: string };

type ExistingMapping = {
  columnMap: ColumnMap;
  isActive: boolean;
} | null;

// Field definitions per target table
const CUSTOMER_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "full_name", label: "Nama Lengkap", hint: "Kolom yang berisi nama customer" },
  { key: "phone", label: "Nomor WA / Telepon", hint: "Akan dinormalisasi ke format 628xxx" },
  { key: "email", label: "Email", hint: "Opsional" },
  { key: "address", label: "Alamat", hint: "Opsional" },
  { key: "province", label: "Provinsi", hint: "Opsional" },
  { key: "city", label: "Kota / Kabupaten", hint: "Opsional" },
  { key: "district", label: "Kecamatan", hint: "Opsional" },
  { key: "sub_district", label: "Kelurahan / Desa", hint: "Opsional" },
  { key: "cs_name", label: "Nama CS", hint: "Nama CS yang handle customer ini" },
  { key: "adv_name", label: "Nama Advertiser", hint: "Nama Advertiser yang acquire customer ini" },
  { key: "platform", label: "Platform", hint: "Shopee / TikTok / Meta / dll" },
];

const TRANSACTION_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "order_id", label: "ID Order / Invoice", hint: "Kolom unik per order (dedup)" },
  { key: "phone", label: "Nomor WA Customer", hint: "Untuk link ke customer" },
  { key: "amount", label: "Total Harga", hint: "Akan di-parse jadi angka" },
  { key: "channel", label: "Channel", hint: "Shopee / TikTok / dll" },
  { key: "status", label: "Status", hint: "Paid / Pending / Cancelled" },
  { key: "occurred_at", label: "Tanggal Order", hint: "Format tanggal" },
  { key: "product_name", label: "Nama Produk", hint: "Produk yang dibeli di order ini" },
  { key: "cs_name", label: "Nama CS", hint: "CS yang handle order ini" },
  { key: "adv_name", label: "Nama Advertiser", hint: "Advertiser yang acquire order ini" },
];

export function MappingEditor({
  datasetId,
  sourceColumns,
  existingCustomerMapping,
  existingTransactionMapping,
}: {
  datasetId: string;
  sourceColumns: SourceColumn[];
  existingCustomerMapping: ExistingMapping;
  existingTransactionMapping: ExistingMapping;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <MappingCard
        datasetId={datasetId}
        targetTable="crm_customers"
        title="Customers"
        icon={<Users className="h-5 w-5" />}
        sourceColumns={sourceColumns}
        fields={CUSTOMER_FIELDS}
        existing={existingCustomerMapping}
      />
      <MappingCard
        datasetId={datasetId}
        targetTable="crm_transactions"
        title="Transactions"
        icon={<Receipt className="h-5 w-5" />}
        sourceColumns={sourceColumns}
        fields={TRANSACTION_FIELDS}
        existing={existingTransactionMapping}
      />
    </div>
  );
}

function MappingCard({
  datasetId,
  targetTable,
  title,
  icon,
  sourceColumns,
  fields,
  existing,
}: {
  datasetId: string;
  targetTable: "crm_customers" | "crm_transactions";
  title: string;
  icon: React.ReactNode;
  sourceColumns: SourceColumn[];
  fields: { key: string; label: string; hint: string }[];
  existing: ExistingMapping;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [columnMap, setColumnMap] = useState<ColumnMap>(
    existing?.columnMap ?? {}
  );
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [enabled, setEnabled] = useState(existing !== null);

  function setField(key: string, value: string) {
    setColumnMap({ ...columnMap, [key]: value });
  }

  function save() {
    startTransition(async () => {
      // Clean: hapus key yang value-nya kosong
      const cleaned: ColumnMap = {};
      for (const [k, v] of Object.entries(columnMap)) {
        if (v) cleaned[k] = v;
      }
      const res = await saveMapping({
        datasetId,
        targetTable,
        columnMap: cleaned,
        isActive,
      });
      if (!res.ok) {
        alert(`Gagal simpan: ${res.error}`);
      }
    });
  }

  function removeMapping() {
    if (!confirm(`Hapus mapping ${targetTable}? Sync ke tabel ini akan berhenti.`))
      return;
    startTransition(async () => {
      const res = await deleteMapping({ datasetId, targetTable });
      if (!res.ok) {
        alert(`Gagal hapus: ${res.error}`);
        return;
      }
      setEnabled(false);
      setColumnMap({});
    });
  }

  function syncNow() {
    startTransition(async () => {
      const res = await syncDatasetToCrm(datasetId, "manual");
      if (!res.ok) {
        alert(`Sync gagal: ${res.error}`);
        return;
      }
      alert("Sync selesai. Cek log untuk detail.");
      router.refresh();
    });
  }

  if (!enabled) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50/50 p-6 text-center">
        <div className="mesh-soft mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl">
          {icon}
        </div>
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Belum di-mapping ke target ini.
        </p>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-white border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Aktifkan Mapping
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="mesh-blue grid h-10 w-10 place-items-center rounded-2xl text-white">
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
            <p className="text-xs text-neutral-500">
              target: <code>{targetTable}</code>
            </p>
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Aktif
        </label>
      </div>

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="grid grid-cols-1 gap-1">
            <label className="text-sm font-medium text-neutral-700">
              {f.label}
            </label>
            <select
              value={columnMap[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              className="h-10 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm"
            >
              <option value="">— Pilih kolom CSV —</option>
              {sourceColumns.map((c) => (
                <option key={c.physical} value={c.physical}>
                  {c.display} ({c.type})
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500">{f.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="mesh-blue inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Simpan
        </button>
        <button
          type="button"
          onClick={syncNow}
          disabled={pending || Object.values(columnMap).every((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          Sync Sekarang
        </button>
        {existing && (
          <button
            type="button"
            onClick={removeMapping}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}
