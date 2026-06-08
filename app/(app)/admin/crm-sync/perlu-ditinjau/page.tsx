import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, ChevronRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Inbox Perlu Ditinjau — nama Excel yang belum match alias.
 * Sama fungsi kayak Setup Wizard, tapi UI nya "review harian".
 *
 * Kalau ada nama di sini, biasanya:
 *   - User baru di-rekrut tapi alias-nya belum di-set
 *   - Typo di Excel (misal `Cs.Budii`)
 *   - Excel pakai nama variant baru yg belum terdaftar
 */
export default async function InboxPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin && !me.isDireksi) redirect("/dashboard");

  const admin = createAdminClient();

  const { data: roleCols } = await admin
    .from("crm_role_columns")
    .select("code, label")
    .eq("is_active", true)
    .order("display_order");

  const summaries: Array<{
    code: string;
    label: string;
    unmappedCount: number;
    unmappedTotalAmount: number;
    sampleNames: string[];
  }> = [];

  let totalUnmapped = 0;

  for (const rc of roleCols ?? []) {
    const { data } = await admin.rpc("get_unlinked_names", {
      p_role: rc.code,
    });
    const arr = (data ?? []) as Array<{
      raw_name: string;
      transaction_count: number;
      total_amount: number;
    }>;
    totalUnmapped += arr.length;
    summaries.push({
      code: rc.code as string,
      label: rc.label as string,
      unmappedCount: arr.length,
      unmappedTotalAmount: arr.reduce(
        (s, r) => s + (Number(r.total_amount) || 0),
        0
      ),
      sampleNames: arr.slice(0, 3).map((r) => r.raw_name),
    });
  }

  const fmtRp = new Intl.NumberFormat("id-ID");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Inbox Perlu Ditinjau
          </h1>
          <p className="text-sm text-neutral-600">
            Nama di Excel yang belum ke-link ke akun mana pun. Tinjau & assign.
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          Total: {totalUnmapped} nama
        </div>
      </div>

      {totalUnmapped === 0 ? (
        <div className="rounded-3xl border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-lg font-semibold text-green-800">
            🎉 Semua nama di Excel sudah ke-link ke akun!
          </p>
          <p className="mt-2 text-sm text-green-700">
            Nggak ada yg perlu ditinjau saat ini. Sampai jumpa pas upload Excel
            berikutnya.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summaries
            .filter((s) => s.unmappedCount > 0)
            .map((s) => (
              <Link
                key={s.code}
                href={`/admin/setup-alias/${s.code}`}
                className="block rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="mesh-red grid h-12 w-12 place-items-center rounded-2xl text-white">
                      <Inbox className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-neutral-900">
                        Kolom {s.label}
                      </p>
                      <p className="text-sm text-neutral-600">
                        <strong>{s.unmappedCount}</strong> nama belum ter-mapping
                        {s.unmappedTotalAmount > 0 && (
                          <>
                            {" "}
                            · Rp{" "}
                            {fmtRp.format(Math.round(s.unmappedTotalAmount))}
                          </>
                        )}
                      </p>
                      {s.sampleNames.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">
                          Contoh:{" "}
                          {s.sampleNames
                            .map((n) => `"${n}"`)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-neutral-400" />
                </div>
              </Link>
            ))}
        </div>
      )}

      <div className="rounded-3xl bg-neutral-50 border border-neutral-100 p-5 text-xs text-neutral-600">
        <p className="font-semibold mb-1">💡 Tips:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Klik baris peran → wizard mapping. Pilih akun untuk tiap nama.
          </li>
          <li>
            Kalau orangnya belum punya akun → bikin di{" "}
            <Link
              href="/admin/users/baru"
              className="font-medium text-neutral-900 underline"
            >
              Admin User → User Baru
            </Link>
            .
          </li>
          <li>
            Setelah save, transaksi yg pakai nama itu otomatis ter-link &
            muncul di dashboard pemilik.
          </li>
        </ul>
      </div>
    </div>
  );
}
