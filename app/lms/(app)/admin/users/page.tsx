import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { Users, Trash2, KeyRound, Ban, CheckCircle2 } from "lucide-react";
import { FlashMessage } from "@/components/lms/ui/flash-message";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { setUserActive, deleteLmsUser, resetUserPassword } from "@/lib/lms/admin-actions";

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

export default async function LmsAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const me = await getCurrentLmsUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from("lms_user_profiles")
    .select("id, full_name, email, role, created_at, is_active")
    .order("created_at", { ascending: false });

  const users = data ?? [];
  const activeCount = users.filter((u) => u.is_active !== false).length;

  return (
    <div className="space-y-6">
      <FlashMessage message={msg} />
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Kelola Pengguna LMS
        </h1>
        <p className="text-sm text-neutral-600">
          {users.length} pengguna terdaftar · {activeCount} aktif.
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
                  <th className="px-6 py-4 font-semibold text-neutral-700">Status</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700">Bergabung</th>
                  <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {users.map((u) => {
                  const joinDate = new Date(u.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  const isActive = u.is_active !== false;
                  const isSelf = u.id === me?.id;
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4 font-medium text-neutral-900">
                        {u.full_name}
                        {isSelf && <span className="ml-2 text-xs text-neutral-400">(Anda)</span>}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">{u.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOR[u.role] ?? "bg-neutral-100 text-neutral-600"}`}
                        >
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isActive ? (
                          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            Aktif
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-500">
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-neutral-500 text-xs">{joinDate}</td>
                      <td className="px-6 py-4">
                        {isSelf ? (
                          <p className="text-right text-xs text-neutral-300">—</p>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reset password */}
                            <ConfirmButton
                              action={resetUserPassword.bind(null, u.id)}
                              danger={false}
                              triggerTitle="Kirim email reset password"
                              className="grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition hover:bg-blue-50 hover:text-brand"
                              title={`Kirim email reset password ke ${u.full_name}?`}
                              description={`Email reset akan dikirim ke ${u.email}.`}
                              confirmLabel="Kirim"
                            >
                              <KeyRound className="h-4 w-4" />
                            </ConfirmButton>

                            {/* Aktif/Nonaktif */}
                            {isActive ? (
                              <ConfirmButton
                                action={setUserActive.bind(null, u.id, false)}
                                triggerTitle="Nonaktifkan akun"
                                className="grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition hover:bg-amber-50 hover:text-amber-600"
                                title={`Nonaktifkan akun ${u.full_name}?`}
                                description="Pengguna tidak akan bisa mengakses LMS sampai diaktifkan kembali."
                                confirmLabel="Nonaktifkan"
                              >
                                <Ban className="h-4 w-4" />
                              </ConfirmButton>
                            ) : (
                              <form action={setUserActive.bind(null, u.id, true)}>
                                <button
                                  type="submit"
                                  title="Aktifkan akun"
                                  className="grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition hover:bg-green-50 hover:text-green-600"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              </form>
                            )}

                            {/* Hapus */}
                            <ConfirmButton
                              action={deleteLmsUser.bind(null, u.id)}
                              triggerTitle="Hapus pengguna"
                              className="grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                              title={`Hapus ${u.full_name}?`}
                              description="Akun beserta seluruh pendaftaran, progress, submission, dan sertifikatnya akan terhapus permanen."
                              confirmLabel="Hapus Permanen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </ConfirmButton>
                          </div>
                        )}
                      </td>
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
