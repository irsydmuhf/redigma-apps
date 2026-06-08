import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RoleColumnsManager } from "./role-columns-manager";

export default async function RoleColumnsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin
    .from("crm_role_columns")
    .select("code, label, divisions, excel_column_hint, is_active, display_order")
    .order("display_order");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Kelola Peran (Kolom Excel)
        </h1>
        <p className="text-sm text-neutral-600">
          Daftar peran yang muncul di kolom Excel transaksi. Aktifkan kalau
          Excel mulai punya kolomnya.
        </p>
      </div>

      <div className="mesh-soft rounded-3xl border border-neutral-100 p-5 text-sm text-neutral-700">
        <div className="flex items-start gap-3">
          <Settings className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Tentang peran</p>
            <p className="mt-1 text-xs">
              Saat ini Redigma punya 2 peran aktif: <strong>CS</strong> dan{" "}
              <strong>Advertiser</strong> — sesuai kolom yg ada di Excel
              sekarang. Peran <strong>CRM</strong>, <strong>Live Host</strong>,
              dan <strong>Content</strong> disiapkan untuk masa depan — aktifkan
              kalau Excel sudah punya kolomnya.
            </p>
          </div>
        </div>
      </div>

      <RoleColumnsManager
        items={(data ?? []).map((d) => ({
          code: d.code as string,
          label: d.label as string,
          divisions: (d.divisions as string[]) ?? [],
          excelColumnHint: (d.excel_column_hint as string) ?? "",
          isActive: d.is_active as boolean,
        }))}
      />
    </div>
  );
}
