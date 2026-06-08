import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_OPTIONS } from "@/lib/auth/role-labels";
import { CreateUserForm } from "./create-user-form";

export default async function NewUserPage() {
  const admin = createAdminClient();
  const [divisionsRes, rolesRes] = await Promise.all([
    admin
      .from("divisions")
      .select("code, name, parent_code, position")
      .order("position"),
    admin
      .from("crm_role_columns")
      .select("code, label, divisions, is_active, excel_column_hint")
      .eq("is_active", true)
      .order("display_order"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke daftar user
      </Link>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          User Baru
        </h1>
        <p className="text-sm text-neutral-600">
          Buat akun karyawan & assign divisi + role. Plus daftarkan nama yang
          dipakai di file Excel transaksi (alias).
        </p>
      </div>

      <CreateUserForm
        divisions={(divisionsRes.data ?? []).map((d) => ({
          code: d.code as string,
          name: d.name as string,
        }))}
        roles={ROLE_OPTIONS}
        roleColumns={(rolesRes.data ?? []).map((r) => ({
          code: r.code as string,
          label: r.label as string,
          divisions: (r.divisions as string[]) ?? [],
          excelColumnHint: (r.excel_column_hint as string) ?? null,
        }))}
      />
    </div>
  );
}
