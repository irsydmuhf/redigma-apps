import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Users,
  GraduationCap,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
import type { LmsRole } from "@/lib/lms/current-user";

export type NavItem = { href: string; label: string; icon: LucideIcon };

const ADV_NAV: NavItem[] = [
  { href: "/lms/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lms/programs", label: "Program Saya", icon: BookOpen },
  { href: "/lms/profile", label: "Profil Saya", icon: GraduationCap },
];

const MANAGER_NAV: NavItem[] = [
  { href: "/lms/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lms/manager/approvals", label: "Persetujuan", icon: ClipboardCheck },
  { href: "/lms/manager/programs", label: "Program", icon: BookOpen },
  { href: "/lms/manager/progress", label: "Progress ADV", icon: BarChart2 },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/lms/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lms/manager/approvals", label: "Persetujuan", icon: ClipboardCheck },
  { href: "/lms/manager/programs", label: "Program", icon: BookOpen },
  { href: "/lms/manager/progress", label: "Progress ADV", icon: BarChart2 },
  { href: "/lms/admin/users", label: "Kelola User", icon: Users },
];

export function getNavItems(role: LmsRole): NavItem[] {
  if (role === "admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
  return ADV_NAV;
}
