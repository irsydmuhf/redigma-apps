import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Zap, Tag } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Bulk Setup Wizard — halaman 1x untuk migrasi data lama.
 * Tampilkan ringkasan per peran aktif: berapa nama unik, berapa udah ke-link,
 * berapa yg masih unlinked. Klik salah satu → wizard mapping detail.
 */

export default async function SetupAliasPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: roleCols } = await admin
    .from("crm_role_columns")
    .select("code, label, excel_column_hint, is_active, display_order")
    .order("display_order");

  // Untuk tiap peran, ambil ringkasan
  const summaries: Array<{
    code: string;
    label: string;
    isActive: boolean;
    unmappedCount: number;
    unmappedTotalAmount: number;
  }> = [];

  for (const rc of roleCols ?? []) {
    if (!rc.is_active) {
      summaries.push({
        code: rc.code as string,
        label: rc.label as string,
        isActive: false,
        unmappedCount: 0,
        unmappedTotalAmount: 0,
      });
      continue;
    }
    const { data } = await admin.rpc("get_unlinked_names", {
      p_role: rc.code,
    });
    const arr = (data ?? []) as Array<{
      raw_name: string;
      transaction_count: number;
      total_amount: number;
    }>;
    summaries.push({
      code: rc.code as string,
      label: rc.label as string,
      isActive: true,
      unmappedCount: arr.length,
      unmappedTotalAmount: arr.reduce(
        (sum, r) => sum + (Number(r.total_amount) || 0),
        0
      ),
    });
  }

  const fmtRp = new Intl.NumberFormat("id-ID");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Setup Alias Awal
        </h1>
        <p className="text-sm text-neutral-600">
          Map nama-nama di Excel ke akun karyawan. Sekali setup, semua history
          transaksi nyambung otomatis.
        </p>
      </div>

      <div className="mesh-purple rounded-3xl p-6 text-white">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Tip:</p>
            <p className="text-sm text-white/90 mt-1">
              Lakukan ini 1x saja untuk migrasi data lama. Setelah ini, alias
              ditambah lewat halaman <strong>User Edit</strong>, atau dari{" "}
              <strong>Inbox Perlu Ditinjau</strong> setiap habis upload baru.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {summaries.map((s) => (
          <div
            key={s.code}
            className={`rounded-3xl border ${
              s.isActive
                ? "border-neutral-200 bg-white"
                : "border-neutral-100 bg-neutral-50"
            } p-6`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-2xl ${
                    s.isActive ? "mesh-blue text-white" : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    Kolom {s.label}
                  </p>
                  {s.isActive ? (
                    <p className="text-sm text-neutral-600">
                      <strong>{s.unmappedCount}</strong> nama unik belum
                      ter-mapping
                      {s.unmappedTotalAmount > 0 && (
                        <>
                          {" "}
                          · Total Rp{" "}
                          {fmtRp.format(Math.round(s.unmappedTotalAmount))}
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Peran ini sedang nonaktif. Aktifkan di Kelola Peran.
                    </p>
                  )}
                </div>
              </div>
              {s.isActive ? (
                s.unmappedCount > 0 ? (
                  <Link
                    href={`/admin/setup-alias/${s.code}`}
                    className="mesh-blue inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90"
                  >
                    Setup
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                    ✓ Semua nama sudah ke-mapping
                  </span>
                )
              ) : (
                <Link
                  href="/admin/role-columns"
                  className="rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Kelola Peran
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
