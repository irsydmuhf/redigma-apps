import Link from "next/link";
import { Database, Plus, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

export default async function DatasetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: datasets } = await supabase
    .from("datasets")
    .select("id, physical_table_name, display_name, description, division_code, created_at, divisions(name)")
    .order("created_at", { ascending: false });

  const list = datasets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Dataset
          </h1>
          <p className="text-sm text-neutral-600">
            Semua dataset yang bisa Anda akses.
          </p>
        </div>
        <Link
          href="/upload"
          className="mesh-blue inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:translate-y-px"
        >
          <Plus className="h-4 w-4" />
          Upload CSV Baru
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-12 text-center">
          <div className="mesh-soft mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl">
            <Database className="h-7 w-7 text-neutral-700" />
          </div>
          <p className="text-sm font-medium text-neutral-700">
            Belum ada dataset
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Klik &ldquo;Upload CSV Baru&rdquo; untuk mulai.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((ds) => {
            const div = Array.isArray(ds.divisions) ? ds.divisions[0] : ds.divisions;
            return (
              <Link
                key={ds.id as string}
                href={`/datasets/${ds.id}`}
                className="group rounded-3xl border border-neutral-100 bg-white p-6 transition hover:border-neutral-200 hover:shadow-sm"
              >
                <div className="mesh-blue mb-4 grid h-10 w-10 place-items-center rounded-2xl text-white">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-neutral-900">
                  {ds.display_name as string}
                </h3>
                <p className="mt-1 text-xs text-neutral-500">
                  {div?.name as string ?? (ds.division_code as string)}
                </p>
                {ds.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                    {ds.description as string}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs">
                  <code className="rounded bg-neutral-100 px-2 py-1 text-neutral-600">
                    {ds.physical_table_name as string}
                  </code>
                  <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
