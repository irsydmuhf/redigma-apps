import Link from "next/link";
import { Plus, UserCheck, UserX, Pencil } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { ToggleActiveButton } from "./toggle-active-button";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, email, full_name, is_active, created_at")
    .order("created_at", { ascending: false });

  const { data: memberships } = await admin
    .from("user_divisions")
    .select("user_id, division_code, role, divisions(name)");

  const membershipMap = new Map<
    string,
    { divisionCode: string; divisionName: string; role: string }[]
  >();
  for (const m of memberships ?? []) {
    const list = membershipMap.get(m.user_id as string) ?? [];
    const div = Array.isArray(m.divisions) ? m.divisions[0] : m.divisions;
    list.push({
      divisionCode: m.division_code as string,
      divisionName: (div?.name as string) ?? (m.division_code as string),
      role: m.role as string,
    });
    membershipMap.set(m.user_id as string, list);
  }

  const list = (profiles ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Admin User
          </h1>
          <p className="text-sm text-neutral-600">
            Kelola akun karyawan & assignment divisi.
          </p>
        </div>
        <Link
          href="/admin/users/baru"
          className="mesh-blue inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px"
        >
          <Plus className="h-4 w-4" />
          User Baru
        </Link>
      </div>

      <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-50/50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Divisi & Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {list.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-12 text-center text-sm text-neutral-500"
                >
                  Belum ada user. Klik &ldquo;User Baru&rdquo; untuk mulai.
                </td>
              </tr>
            )}
            {list.map((p) => {
              const mems = membershipMap.get(p.id) ?? [];
              return (
                <tr key={p.id} className="text-sm">
                  <td className="px-6 py-4">
                    <div className="font-medium text-neutral-900">
                      {p.full_name || p.email.split("@")[0]}
                    </div>
                    <div className="text-xs text-neutral-500">{p.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {mems.length === 0 && (
                        <span className="text-xs text-neutral-400">
                          Belum di-assign
                        </span>
                      )}
                      {mems.map((m) => (
                        <span
                          key={m.divisionCode}
                          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium text-neutral-700">
                            {m.divisionName}
                          </span>
                          <span className="text-neutral-500">·</span>
                          <span className="font-semibold text-neutral-900">
                            {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ??
                              m.role}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {p.is_active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                        <UserCheck className="h-3 w-3" />
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                        <UserX className="h-3 w-3" />
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/admin/users/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Link>
                      <ToggleActiveButton
                        userId={p.id}
                        isActive={p.is_active}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
