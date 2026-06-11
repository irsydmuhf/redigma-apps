"use client";

import { useState } from "react";
import { addContent } from "@/lib/lms/program-actions";
import { FileText, Video, Paperclip } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-blue-300";

export function AddContentForm({
  moduleId,
  programId,
}: {
  moduleId: string;
  programId: string;
}) {
  const [type, setType] = useState<"text" | "video" | "file">("text");

  return (
    <form
      action={addContent.bind(null, moduleId, programId)}
      className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-3"
    >
      {/* Pilih tipe konten */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { v: "text", label: "Teks", Icon: FileText },
          { v: "video", label: "Video", Icon: Video },
          { v: "file", label: "File", Icon: Paperclip },
        ] as const).map(({ v, label, Icon }) => (
          <label
            key={v}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition ${
              type === v
                ? "border-blue-300 bg-white text-blue-700"
                : "border-neutral-200 bg-white/50 text-neutral-500 hover:bg-white"
            }`}
          >
            <input
              type="radio"
              name="type"
              value={v}
              checked={type === v}
              onChange={() => setType(v)}
              className="sr-only"
            />
            <Icon className="h-3.5 w-3.5" /> {label}
          </label>
        ))}
      </div>

      {/* Field sesuai tipe */}
      {type === "text" && (
        <textarea
          name="content_text"
          placeholder="Isi teks materi…"
          rows={3}
          required
          className={`${inputCls} resize-none`}
        />
      )}

      {type === "video" && (
        <div className="space-y-1">
          <input
            name="video_url"
            placeholder="Tempel link video di sini"
            required
            className={inputCls}
          />
          <p className="text-[11px] text-neutral-500">
            Bisa YouTube, Vimeo, Google Drive, atau link file .mp4 — diputar langsung di dalam LMS.
          </p>
        </div>
      )}

      {type === "file" && (
        <div className="space-y-2">
          <input name="file_url" placeholder="URL file (PDF/PPT dll)" required className={inputCls} />
          <input name="file_name" placeholder="Nama file (cth: Materi_SOP.pdf)" className={inputCls} />
        </div>
      )}

      <button
        type="submit"
        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        Simpan Konten
      </button>
    </form>
  );
}
