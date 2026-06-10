import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { generateInviteLink, deactivateInviteLink } from "./actions";
import { Link2, PlusCircle, X, Copy } from "lucide-react";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InviteLinkPage({ params }: Props) {
  const { id: programId } = await params;
  const admin = createAdminClient();

  const [{ data: program }, { data: links }] = await Promise.all([
    admin
      .from("lms_programs")
      .select("id, name")
      .eq("id", programId)
      .single(),
    admin
      .from("lms_invite_links")
      .select("id, token, is_active, created_at, created_by")
      .eq("program_id", programId)
      .order("created_at", { ascending: false }),
  ]);

  if (!program) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const activeLinks = (links ?? []).filter((l) => l.is_active);
  const inactiveLinks = (links ?? []).filter((l) => !l.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/lms/manager/programs"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Program
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="text-sm font-medium text-neutral-900">{program.name}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Invite Link
          </h1>
          <p className="text-sm text-neutral-600">
            Bagikan <b>token</b> ke ADV. ADV masuk ke menu <b>Ikuti Program</b> lalu tempelkan token tersebut.
          </p>
        </div>
        <form action={generateInviteLink.bind(null, programId)}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700"
          >
            <PlusCircle className="h-4 w-4" />
            Buat Link Baru
          </button>
        </form>
      </div>

      {activeLinks.length === 0 && (
        <div className="rounded-3xl border border-neutral-100 bg-white p-8 text-center space-y-3">
          <Link2 className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700">Belum ada invite link aktif</p>
          <p className="text-xs text-neutral-500">
            Klik "Buat Link Baru" untuk membuat link pendaftaran.
          </p>
        </div>
      )}

      {activeLinks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">Link Aktif</h2>
          {activeLinks.map((link) => {
            const url = `${appUrl}/lms/register?token=${link.token}`;
            const createdDate = new Date(link.created_at).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={link.id}
                className="rounded-3xl border border-neutral-100 bg-white p-5 space-y-4"
              >
                {/* Token utama — bagikan ini ke ADV */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Token (bagikan ke ADV)</p>
                  <div className="flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3">
                    <code className="flex-1 select-all text-sm font-mono font-semibold text-white break-all">
                      {link.token}
                    </code>
                    <Copy className="h-4 w-4 text-neutral-400 shrink-0" />
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] text-neutral-400 font-medium">URL alternatif (opsional)</p>
                    <p className="break-all font-mono text-xs text-neutral-500 select-all">
                      {url}
                    </p>
                    <p className="text-xs text-neutral-400">Dibuat {createdDate}</p>
                  </div>
                  <form action={deactivateInviteLink.bind(null, link.id, programId)}>
                    <button
                      type="submit"
                      className="shrink-0 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      <X className="h-3.5 w-3.5" />
                      Nonaktifkan
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {inactiveLinks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500">Link Tidak Aktif</h2>
          {inactiveLinks.map((link) => {
            const url = `${appUrl}/lms/register?token=${link.token}`;
            const createdDate = new Date(link.created_at).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <div
                key={link.id}
                className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5 opacity-60"
              >
                <p className="break-all font-mono text-xs text-neutral-500">{url}</p>
                <p className="mt-1 text-xs text-neutral-400">Dibuat {createdDate} · Nonaktif</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
