import { createAdminClient } from "@/lib/supabase/admin";
import { Users, ShieldCheck } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  adv: "ADV",
  manager: "Manager",
  admin: "Admin",
};

const ROLE_COLOR: Record<string, string> = {
  adv: "bg-blue-50 text-blue-700",
  manager: "bg-purple-50 text-purple-700",
  admin: "bg-red-50 text-red-700",
};

export default async function LmsAdminUsersPage() {
  const admin = createAdminClient();

  const { data } = await admin
    .from("lms_user_profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  const users = data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Kelola Pengguna LMS
        </h1>
        <p className="text-sm text-neutral-600">
          {users.length} pengguna terdaftar di sistem LMS.
        </p>
      </div>

      {users.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-3">
          <Users className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada pengguna</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-neutral-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left">
                  <th className="px-6 py-4 font-semibold text-neutral-700">Nama</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Email</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Role</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Bergabung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {users.map((u) => {
                  const joinDate = new Date(u.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4 font-medium text-neutral-900">
                        {u.full_name}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">{u.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-600"}`}
                        >
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-neutral-500 text-xs">{joinDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
