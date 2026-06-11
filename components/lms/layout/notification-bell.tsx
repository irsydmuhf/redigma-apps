"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { markReadAndGo, markAllNotificationsRead } from "@/lib/lms/notification-actions";

export type LmsNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: LmsNotification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifikasi"
        className="relative grid h-9 w-9 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Klik di luar untuk menutup */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">Notifikasi</p>
              {unreadCount > 0 && (
                <form action={markAllNotificationsRead}>
                  <button
                    type="submit"
                    className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca
                  </button>
                </form>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="mx-auto h-7 w-7 text-neutral-200" />
                  <p className="mt-2 text-xs text-neutral-400">Belum ada notifikasi.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <form key={n.id} action={markReadAndGo.bind(null, n.id, n.link ?? "/lms/dashboard")}>
                    <button
                      type="submit"
                      className={`flex w-full items-start gap-3 border-b border-neutral-50 px-4 py-3 text-left transition hover:bg-neutral-50 ${
                        n.is_read ? "" : "bg-blue-50/40"
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.is_read ? "bg-transparent" : "bg-brand"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-neutral-800">{n.title}</span>
                        {n.body && (
                          <span className="mt-0.5 block text-xs text-neutral-500">{n.body}</span>
                        )}
                        <span className="mt-1 block text-[11px] text-neutral-400">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </form>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
