"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import type { LmsRole } from "@/lib/lms/current-user";
import { getNavItems } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function LmsSidebar({ role }: { role: LmsRole }) {
  const items = getNavItems(role);
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-neutral-100 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-neutral-100 px-4">
        <Image
          src="/redigma-logo/wordmark-blue-yellow.png"
          alt="Redigma"
          width={120}
          height={36}
          priority
          className="h-8 w-auto"
        />
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
          LMS
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-brand text-white"
                  : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-white" : "text-neutral-500"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-100 p-4 space-y-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
        >
          <Settings className="h-3.5 w-3.5" />
          Kembali ke Redigma Apps
        </Link>
      </div>
    </aside>
  );
}
