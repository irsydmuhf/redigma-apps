import { createProgram } from "@/lib/lms/program-actions";
import Link from "next/link";

export default function NewProgramPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/lms/manager/programs"
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Program
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="text-sm font-medium text-neutral-900">Program Baru</span>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Buat Program Onboarding
        </h1>
        <p className="text-sm text-neutral-600">
          Isi informasi dasar program. Phases, modul, dan konten bisa ditambahkan setelah program dibuat.
        </p>
      </div>

      <form action={createProgram} className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="name">
            Nama Program <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="cth: Onboarding ADV Batch 2"
            className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="description">
            Deskripsi
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Jelaskan tujuan dan ruang lingkup program ini…"
            className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700" htmlFor="platform">
            Platform Utama
          </label>
          <select
            id="platform"
            name="platform"
            className="w-full rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400 bg-white"
          >
            <option value="other">Lainnya</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="shopee">Shopee</option>
            <option value="tokopedia">Tokopedia</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/lms/manager/programs"
            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Batal
          </Link>
          <button
            type="submit"
            className="rounded-2xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            Buat Program →
          </button>
        </div>
      </form>
    </div>
  );
}
