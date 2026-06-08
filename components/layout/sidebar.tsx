import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Upload,
  Database,
  History,
  Trash2,
  Users,
  Settings,
  Sparkles,
  Tag,
  Inbox,
  Layers,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: false },
  { href: "/upload", label: "Upload CSV", icon: Upload, admin: false },
  { href: "/datasets", label: "Dataset", icon: Database, admin: false },
  { href: "/riwayat", label: "Riwayat Import", icon: History, admin: false },
  { href: "/trash", label: "Trash", icon: Trash2, admin: true },
  { href: "/admin/users", label: "Admin User", icon: Users, admin: true },
  { href: "/admin/crm-sync", label: "CRM Sync", icon: Sparkles, admin: true },
  { href: "/admin/crm-sync/perlu-ditinjau", label: "Inbox Tinjau", icon: Inbox, admin: true },
  { href: "/admin/setup-alias", label: "Setup Alias", icon: Tag, admin: true },
  { href: "/admin/role-columns", label: "Kelola Peran", icon: Layers, admin: true },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings, admin: false },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const items = NAV_ITEMS.filter((item) => !item.admin || isAdmin);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-neutral-100 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center justify-center px-4">
        <Image
          src="/redigma-logo/wordmark-blue-yellow.png"
          alt="Redigma"
          width={140}
          height={40}
          priority
          className="h-9 w-auto"
        />
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900"
            >
              <Icon className="h-4 w-4 text-neutral-500" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-100 p-4">
        <div className="mesh-soft rounded-3xl p-4">
          <p className="text-xs font-semibold text-neutral-900">
            Butuh bantuan?
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Hubungi Data IT untuk konfigurasi divisi & akses.
          </p>
        </div>
      </div>
    </aside>
  );
}
