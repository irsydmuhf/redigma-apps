import { StatCard } from "@/components/dashboard/stat-card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABEL } from "@/lib/auth/role-labels";
import { createClient } from "@/lib/supabase/server";
import {
  Database,
  Upload,
  Users,
  TrendingUp,
  FileText,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { count: datasetCount } = await supabase
    .from("datasets")
    .select("id", { count: "exact", head: true });

  const greeting = user.fullName || user.email.split("@")[0];
  const activeDiv = user.divisions.find(
    (d) => d.divisionCode === user.activeDivisionCode
  );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Selamat datang, {greeting}
        </h1>
        <p className="text-sm text-neutral-600">
          {activeDiv
            ? `Divisi aktif: ${activeDiv.divisionName} · ${ROLE_LABEL[activeDiv.role]}`
            : "Anda belum di-assign ke divisi mana pun. Hubungi Data IT."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="blue"
          label="Total Dataset"
          value={String(datasetCount ?? 0)}
          trend="Aktif"
          icon={Database}
        />
        <StatCard
          variant="red"
          label="Upload Bulan Ini"
          value="0"
          trend="Phase 6"
          icon={Upload}
        />
        <StatCard
          variant="yellow"
          label="Divisi Anda"
          value={String(user.divisions.length)}
          trend={user.isAdmin ? "Admin" : "Aktif"}
          icon={Users}
        />
        <StatCard
          variant="green"
          label="Status Sistem"
          value="OK"
          trend="Online"
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-neutral-100 bg-white p-7 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Mulai dari sini
              </h3>
              <p className="text-sm text-neutral-500">
                Phase 3 — Upload CSV jadi tabel Postgres
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-50 p-2.5">
              <TrendingUp className="h-5 w-5 text-neutral-600" />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/upload"
              className="mesh-soft flex items-center gap-4 rounded-2xl p-5 transition hover:opacity-90"
            >
              <div className="mesh-blue grid h-11 w-11 place-items-center rounded-2xl text-white shadow">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Upload CSV
                </p>
                <p className="text-xs text-neutral-600">
                  Auto-detect schema otomatis
                </p>
              </div>
            </Link>

            <Link
              href="/datasets"
              className="mesh-soft flex items-center gap-4 rounded-2xl p-5 transition hover:opacity-90"
            >
              <div className="mesh-green grid h-11 w-11 place-items-center rounded-2xl text-white shadow">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Lihat Dataset
                </p>
                <p className="text-xs text-neutral-600">
                  {datasetCount ?? 0} dataset tersedia
                </p>
              </div>
            </Link>
          </div>

          <div className="mt-6 grid place-items-center rounded-2xl bg-neutral-50/50 py-8 text-center">
            <div className="mesh-soft mb-3 grid h-12 w-12 place-items-center rounded-2xl">
              <FileText className="h-5 w-5 text-neutral-700" />
            </div>
            <p className="text-sm font-medium text-neutral-700">
              Smart match & schema drift di Phase 5
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Phase 3 fokus pada upload dasar & viewer minimal.
            </p>
          </div>
        </div>

        <div className="mesh-purple rounded-3xl p-7 text-white">
          <p className="text-sm font-medium text-white/80">Akun Anda</p>
          <p className="mt-3 break-all text-xl font-bold">{user.email}</p>
          {user.fullName && (
            <p className="text-sm text-white/80">{user.fullName}</p>
          )}

          <div className="mt-6 space-y-3 border-t border-white/20 pt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/80">Divisi</span>
              <span className="font-semibold">{user.divisions.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/80">Status</span>
              <span className="font-semibold">
                {user.isActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            {user.isAdmin && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/80">Akses</span>
                <span className="font-semibold">Admin</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
