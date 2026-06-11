"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, Settings } from "lucide-react";
import type { LmsRole } from "@/lib/lms/current-user";
import { getNavItems } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function LmsMobileNav({ role }: { role: LmsRole }) {
  const [open, setOpen] = useState(false);
  const items = getNavItems(role);
  const pathname = usePathname();

  // Tutup drawer otomatis saat pindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Kunci scroll body saat drawer terbuka
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-neutral-100 px-4">
              <div className="flex items-center gap-2">
                <Image
                  src="/redigma-logo/wordmark-blue-yellow.png"
                  alt="Redigma"
                  width={120}
                  height={36}
                  priority
                  className="h-7 w-auto"
                />
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                  LMS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="grid h-9 w-9 place-items-center rounded-xl text-neutral-500 transition hover:bg-neutral-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-white" : "text-neutral-500"}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-neutral-100 p-4">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
              >
                <Settings className="h-3.5 w-3.5" />
                Kembali ke Redigma Apps
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
