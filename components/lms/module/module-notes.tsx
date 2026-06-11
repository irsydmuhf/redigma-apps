"use client";

import { useRef, useState } from "react";
import { NotebookPen, Check, Loader2 } from "lucide-react";

export function ModuleNotes({
  moduleId,
  enrollmentId,
  initial,
}: {
  moduleId: string;
  enrollmentId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">(initial ? "saved" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(content: string) {
    setStatus("saving");
    try {
      const res = await fetch(`/lms/module/${moduleId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, content }),
        keepalive: true,
      });
      setStatus(res.ok ? "saved" : "idle");
    } catch {
      setStatus("idle");
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 1200);
  }

  function onBlur() {
    if (timer.current) clearTimeout(timer.current);
    if (value !== initial) save(value);
  }

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <NotebookPen className="h-4 w-4 text-brand" /> Catatan Saya
        </div>
        <span className="flex items-center gap-1 text-xs text-neutral-400">
          {status === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan…
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-500" /> Tersimpan
            </>
          )}
        </span>
      </div>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={5}
        placeholder="Tulis catatan sambil menonton video atau membaca materi… (otomatis tersimpan)"
        className="w-full resize-y rounded-2xl border border-neutral-200 px-4 py-3 text-sm leading-relaxed outline-none focus:border-blue-300"
      />
      <p className="text-xs text-neutral-400">Catatan ini privat — hanya kamu yang bisa melihatnya.</p>
    </div>
  );
}
