"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmButtonProps = {
  /** Server action (boleh sudah di-bind) yang dijalankan saat dikonfirmasi. */
  action: (formData: FormData) => void | Promise<void>;
  /** Isi tombol pemicu (mis. ikon / teks). */
  children: React.ReactNode;
  /** className tombol pemicu — samakan dengan tombol aslinya. */
  className?: string;
  triggerTitle?: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Gaya merah (destruktif). Default true. */
  danger?: boolean;
};

export function ConfirmButton({
  action,
  children,
  className,
  triggerTitle,
  title,
  description,
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  danger = true,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function close() {
    setShow(false);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShow(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <form action={action}>
      <button
        type="button"
        title={triggerTitle}
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={close}
            aria-hidden="true"
            className={`absolute inset-0 bg-neutral-900/40 transition-opacity duration-200 ${
              show ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Panel */}
          <div
            role="alertdialog"
            aria-modal="true"
            className={`relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl transition-all duration-200 ease-out ${
              show ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Tutup"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                  danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-brand"
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
                {description && <p className="text-sm leading-relaxed text-neutral-500">{description}</p>}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                {cancelLabel}
              </button>
              <button
                type="submit"
                className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white transition active:translate-y-px ${
                  danger ? "bg-red-600 hover:bg-red-500" : "bg-brand hover:opacity-90"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
