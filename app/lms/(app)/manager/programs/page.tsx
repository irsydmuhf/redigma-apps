import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { BookOpen, Link2, PlusCircle, Pencil, BarChart2 } from "lucide-react";
import Link from "next/link";
import { FlashMessage } from "@/components/lms/ui/flash-message";
import { DeleteProgramButton } from "@/components/lms/programs/delete-program-button";

export default async function LmsProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const admin = createAdminClient();
  const me = await getCurrentLmsUser();
  const isAdmin = me?.role === "admin";

  const { data } = await admin
    .from("lms_programs")
    .select("id, name, description, is_archived, created_at")
    .order("created_at", { ascending: false });

  const programs = data ?? [];

  return (
    <div className="space-y-6">
      <FlashMessage message={msg} />
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Program Onboarding
          </h1>
          <p className="text-sm text-neutral-600">
            Kelola program dan undang ADV lewat invite link.
          </p>
        </div>
        <Link
          href="/lms/manager/programs/new"
          className="flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          <PlusCircle className="h-4 w-4" /> Buat Program
        </Link>
      </div>

      {programs.length === 0 ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center space-y-4">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada program</p>
          <p className="text-xs text-neutral-500">
            Program onboarding akan ditampilkan di sini setelah ditambahkan oleh Admin.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((p) => (
            <div
              key={p.id}
              className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="mesh-blue grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {p.name}
                    </p>
                    {p.is_archived && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        Diarsipkan
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/lms/manager/programs/${p.id}/edit`}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-200 hover:bg-neutral-50"
                >
                  <Pencil className="h-4 w-4 text-neutral-500" />
                  Edit
                </Link>
                <Link
                  href={`/lms/manager/programs/${p.id}/progress`}
                  className="flex flex-1 items-center gap-2 rounded-2xl border border-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-200 hover:bg-neutral-50"
                >
                  <BarChart2 className="h-4 w-4 text-neutral-500" />
                  Progress ADV
                </Link>
                <Link
                  href={`/lms/manager/programs/${p.id}/invite`}
                  className="flex items-center gap-2 rounded-2xl border border-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-200 hover:bg-neutral-50"
                >
                  <Link2 className="h-4 w-4 text-neutral-500" />
                </Link>
                {isAdmin && (
                  <DeleteProgramButton programId={p.id} programName={p.name} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
