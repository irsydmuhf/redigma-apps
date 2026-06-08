import Link from "next/link";
import {
  User,
  Mail,
  Building2,
  Shield,
  Users,
  Trash2,
  ExternalLink,
  Info,
  KeyRound,
  Tag,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { UbahPasswordButton } from "./ubah-password-button";

const ROLE_TONE: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  head: "bg-blue-100 text-blue-700",
  spv: "bg-green-100 text-green-700",
  staff: "bg-neutral-100 text-neutral-700",
  direksi: "bg-amber-100 text-amber-700",
};

export default async function PengaturanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Ambil alias diri sendiri (read-only)
  const admin = createAdminClient();
  const [aliasRes, roleColsRes] = await Promise.all([
    admin
      .from("user_role_aliases")
      .select("id, role_code, alias_text, valid_from, valid_to")
      .eq("user_id", user.id)
      .order("role_code"),
    admin
      .from("crm_role_columns")
      .select("code, label")
      .eq("is_active", true),
  ]);

  const aliasGroups = new Map<string, Array<{ text: string; validTo: string | null }>>();
  for (const a of aliasRes.data ?? []) {
    const k = a.role_code as string;
    const list = aliasGroups.get(k) ?? [];
    list.push({ text: a.alias_text as string, validTo: (a.valid_to as string) ?? null });
    aliasGroups.set(k, list);
  }
  const roleLabels = new Map<string, string>(
    (roleColsRes.data ?? []).map((r) => [r.code as string, r.label as string])
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Pengaturan
        </h1>
        <p className="text-sm text-neutral-600">
          Info akun, divisi, dan akses Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Akun */}
          <section className="rounded-3xl border border-neutral-100 bg-white p-7">
            <div className="mb-5 flex items-center gap-2">
              <User className="h-4 w-4 text-neutral-500" />
              <h2 className="text-lg font-semibold text-neutral-900">
                Profil Akun
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Email"
                value={user.email}
                icon={<Mail className="h-4 w-4 text-neutral-400" />}
              />
              <Field
                label="Nama Lengkap"
                value={user.fullName ?? "—"}
                icon={<User className="h-4 w-4 text-neutral-400" />}
              />
              <Field
                label="Status Akun"
                value={user.isActive ? "Aktif" : "Nonaktif"}
                tone={user.isActive ? "green" : "red"}
              />
              <Field
                label="Akses Spesial"
                value={
                  user.isAdmin
                    ? "Admin (Data IT)"
                    : user.isDireksi
                    ? "Direksi (read-only)"
                    : "User Biasa"
                }
                tone={user.isAdmin ? "purple" : user.isDireksi ? "amber" : "neutral"}
              />
            </div>

            <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
              <Info className="mr-1 inline h-3 w-3" />
              Edit nama atau ubah email belum tersedia di MVP. Hubungi Data IT
              untuk perubahan profil.
            </p>
          </section>

          {/* Ubah Password */}
          <section className="rounded-3xl border border-neutral-100 bg-white p-7">
            <div className="mb-5 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-neutral-500" />
              <h2 className="text-lg font-semibold text-neutral-900">
                Ubah Password
              </h2>
            </div>

            <p className="mb-4 text-sm text-neutral-600">
              Klik tombol di bawah → kami akan mengirim link rahasia ke email{" "}
              <strong>{user.email}</strong>. Buka email, klik link, lalu set
              password baru Anda.
            </p>

            <UbahPasswordButton />
          </section>

          {/* Divisi & Role */}
          <section className="rounded-3xl border border-neutral-100 bg-white p-7">
            <div className="mb-5 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-neutral-500" />
              <h2 className="text-lg font-semibold text-neutral-900">
                Divisi & Role Anda
              </h2>
            </div>

            {user.divisions.length === 0 ? (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Anda belum di-assign ke divisi mana pun. Hubungi Admin Data IT.
              </p>
            ) : (
              <div className="space-y-2">
                {user.divisions.map((d) => (
                  <div
                    key={d.divisionCode}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="mesh-soft grid h-9 w-9 shrink-0 place-items-center rounded-2xl">
                        <Building2 className="h-4 w-4 text-neutral-700" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {d.divisionName}
                        </p>
                        <code className="text-xs text-neutral-500">
                          {d.divisionCode}
                        </code>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        ROLE_TONE[d.role] ?? "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {ROLE_LABEL[d.role]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
              <Info className="mr-1 inline h-3 w-3" />
              Untuk menambah / mengubah divisi atau role, hubungi Admin Data IT.
              Admin bisa edit lewat halaman{" "}
              {user.isAdmin ? (
                <Link
                  href="/admin/users"
                  className="font-semibold text-neutral-900 underline"
                >
                  Admin User
                </Link>
              ) : (
                <span className="font-semibold">Admin User</span>
              )}
              .
            </p>
          </section>

          {/* Nama di Excel (Alias) — read-only */}
          {aliasGroups.size > 0 && (
            <section className="rounded-3xl border border-neutral-100 bg-white p-7">
              <div className="mb-5 flex items-center gap-2">
                <Tag className="h-4 w-4 text-neutral-500" />
                <h2 className="text-lg font-semibold text-neutral-900">
                  Nama Anda di Excel (Alias)
                </h2>
              </div>
              <p className="mb-4 text-sm text-neutral-600">
                Nama-nama berikut adalah cara nama Anda muncul di file Excel
                transaksi. Transaksi dengan nama-nama ini akan otomatis nyambung
                ke akun Anda.
              </p>
              <div className="space-y-3">
                {Array.from(aliasGroups.entries()).map(([roleCode, list]) => (
                  <div
                    key={roleCode}
                    className="rounded-2xl border border-neutral-100 bg-neutral-50/50 px-4 py-3"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Sebagai {roleLabels.get(roleCode) ?? roleCode}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-900"
                        >
                          {a.text}
                          {a.validTo && (
                            <span className="text-[10px] text-blue-700">
                              (sampai {a.validTo})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                <Info className="mr-1 inline h-3 w-3" />
                Mau tambah/ubah? Hubungi Admin Data IT atau atasan (Head/SPV)
                divisi Anda.
              </p>
            </section>
          )}

          {/* Akses cepat admin */}
          {user.isAdmin && (
            <section className="rounded-3xl border border-neutral-100 bg-white p-7">
              <div className="mb-5 flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-600" />
                <h2 className="text-lg font-semibold text-neutral-900">
                  Akses Admin
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/admin/users"
                  className="mesh-soft flex items-center gap-3 rounded-2xl p-4 transition hover:opacity-90"
                >
                  <div className="mesh-blue grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      Admin User
                    </p>
                    <p className="text-xs text-neutral-600">
                      Kelola user & divisi
                    </p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 text-neutral-400" />
                </Link>

                <Link
                  href="/trash"
                  className="mesh-soft flex items-center gap-3 rounded-2xl p-4 transition hover:opacity-90"
                >
                  <div className="mesh-red grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      Trash
                    </p>
                    <p className="text-xs text-neutral-600">
                      Data rolled-back
                    </p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar info */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="mesh-purple rounded-3xl p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Tentang Aplikasi
            </p>
            <p className="mt-3 text-lg font-bold">Database Redigma</p>
            <p className="text-sm text-white/80">Super App MVP v1.0</p>

            <div className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">Phase</span>
                <span className="font-semibold">10 / 10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Status</span>
                <span className="font-semibold">MVP Ready</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-100 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Butuh bantuan?
            </p>
            <p className="mt-3 text-sm text-neutral-700">
              Hubungi tim Data IT untuk:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600">
              <li>Tambah / ubah divisi & role</li>
              <li>Reset password</li>
              <li>Recovery data yang ter-rollback</li>
              <li>Akses dataset divisi lain</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "purple" | "amber";
}) {
  const valueTone = {
    neutral: "text-neutral-900",
    green: "text-green-700",
    red: "text-red-700",
    purple: "text-purple-700",
    amber: "text-amber-700",
  }[tone ?? "neutral"];

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {icon}
        {label}
      </p>
      <p className={`break-all text-sm font-semibold ${valueTone}`}>{value}</p>
    </div>
  );
}
