import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, User, Mail } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { EditUserAliases } from "./edit-user-aliases";
import { DeactivateButton } from "./deactivate-button";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const admin = createAdminClient();

  const [profileRes, divisionsRes, aliasesRes, roleColsRes, allUsersRes] =
    await Promise.all([
      admin
        .from("user_profiles")
        .select("id, email, full_name, is_active")
        .eq("id", id)
        .single(),
      admin
        .from("user_divisions")
        .select("division_code, role, divisions(name)")
        .eq("user_id", id),
      admin
        .from("user_role_aliases")
        .select("id, role_code, alias_text, valid_from, valid_to")
        .eq("user_id", id)
        .order("role_code")
        .order("alias_text"),
      admin
        .from("crm_role_columns")
        .select("code, label, divisions, is_active, excel_column_hint")
        .eq("is_active", true)
        .order("display_order"),
      admin
        .from("user_profiles")
        .select("id, email, full_name, is_active")
        .eq("is_active", true)
        .neq("id", id)
        .order("full_name"),
    ]);

  if (!profileRes.data) notFound();
  const profile = profileRes.data;

  const memberships = (divisionsRes.data ?? []).map((m) => {
    const d = Array.isArray(m.divisions) ? m.divisions[0] : m.divisions;
    return {
      divisionCode: m.division_code as string,
      divisionName: (d?.name as string) ?? (m.division_code as string),
      role: m.role as string,
    };
  });

  const userDivisionCodes = memberships.map((m) => m.divisionCode);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Kembali ke daftar user
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            {profile.full_name || profile.email}
          </h1>
          <p className="text-sm text-neutral-600 flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" />
            {profile.email}
            {!profile.is_active && (
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
                Non-aktif
              </span>
            )}
          </p>
        </div>
        {profile.is_active && (
          <DeactivateButton
            userId={profile.id as string}
            userName={(profile.full_name as string) || (profile.email as string)}
            replacementCandidates={(allUsersRes.data ?? []).map((u) => ({
              id: u.id as string,
              email: u.email as string,
              fullName: (u.full_name as string) ?? null,
            }))}
            activeRoleCodes={(roleColsRes.data ?? []).map((r) => r.code as string)}
          />
        )}
      </div>

      <section className="rounded-3xl border border-neutral-100 bg-white p-7">
        <div className="mb-5 flex items-center gap-2">
          <User className="h-4 w-4 text-neutral-500" />
          <h2 className="text-lg font-semibold text-neutral-900">
            Divisi & Role
          </h2>
        </div>
        <div className="space-y-2">
          {memberships.length === 0 && (
            <p className="text-sm text-neutral-500">Belum di-assign divisi.</p>
          )}
          {memberships.map((m) => (
            <div
              key={m.divisionCode}
              className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-neutral-50/50 px-4 py-3"
            >
              <p className="text-sm font-medium text-neutral-900">
                {m.divisionName}
              </p>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          ℹ️ Edit divisi/role belum tersedia di MVP. Buat user baru atau
          hubungi developer kalau perlu pindah.
        </p>
      </section>

      <EditUserAliases
        userId={profile.id as string}
        userDivisionCodes={userDivisionCodes}
        initialAliases={(aliasesRes.data ?? []).map((a) => ({
          id: a.id as number,
          roleCode: a.role_code as string,
          aliasText: a.alias_text as string,
          validFrom: (a.valid_from as string) ?? null,
          validTo: (a.valid_to as string) ?? null,
        }))}
        roleColumns={(roleColsRes.data ?? []).map((r) => ({
          code: r.code as string,
          label: r.label as string,
          divisions: (r.divisions as string[]) ?? [],
          excelColumnHint: (r.excel_column_hint as string) ?? null,
        }))}
      />
    </div>
  );
}
