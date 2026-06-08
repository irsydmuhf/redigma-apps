import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SetupRoleWizard } from "./setup-role-wizard";

export default async function SetupRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  const [roleColRes, unmappedRes, candidatesRes] = await Promise.all([
    admin
      .from("crm_role_columns")
      .select("code, label, divisions, excel_column_hint")
      .eq("code", role)
      .single(),
    admin.rpc("get_unlinked_names", { p_role: role }),
    admin
      .from("user_profiles")
      .select("id, email, full_name, is_active")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (!roleColRes.data) notFound();

  const relevantDivs = (roleColRes.data.divisions as string[]) ?? [];

  // Filter candidates: yg punya divisi relevan dengan peran ini
  const { data: memberships } = await admin
    .from("user_divisions")
    .select("user_id, division_code")
    .in("division_code", relevantDivs);

  const eligibleIds = new Set(
    (memberships ?? []).map((m) => m.user_id as string)
  );

  const candidates = (candidatesRes.data ?? [])
    .filter((u) => eligibleIds.has(u.id as string))
    .map((u) => ({
      id: u.id as string,
      email: u.email as string,
      fullName: (u.full_name as string) ?? null,
    }));

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/setup-alias"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke ringkasan
      </Link>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Setup Alias: {roleColRes.data.label}
        </h1>
        <p className="text-sm text-neutral-600">
          Map setiap nama di kolom Excel ke akun karyawan. Bisa juga &ldquo;Buat
          akun baru&rdquo; kalau orangnya belum punya akun.
        </p>
      </div>

      <SetupRoleWizard
        roleCode={role}
        roleLabel={roleColRes.data.label as string}
        unmappedNames={((unmappedRes.data ?? []) as Array<Record<string, unknown>>).map(
          (r) => ({
            rawName: r.raw_name as string,
            transactionCount: r.transaction_count as number,
            totalAmount: r.total_amount as number,
          })
        )}
        candidates={candidates}
      />
    </div>
  );
}
