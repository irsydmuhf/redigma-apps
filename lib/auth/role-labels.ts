import type { Role } from "./current-user";

export const ROLE_LABEL: Record<Role, string> = {
  staff: "Staff",
  spv: "SPV",
  head: "Head",
  direksi: "Direksi",
  admin: "Admin",
};

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  {
    value: "staff",
    label: "Staff",
    description: "Akses upload & view dataset divisinya sendiri",
  },
  {
    value: "spv",
    label: "SPV",
    description: "Staff + lihat history tim + rollback import sendiri",
  },
  {
    value: "head",
    label: "Head of",
    description: "SPV + approve perubahan schema",
  },
  {
    value: "direksi",
    label: "Direksi",
    description: "Read-only semua data semua divisi",
  },
  {
    value: "admin",
    label: "Admin (Data IT)",
    description: "Full access — kelola user, divisi, sistem",
  },
];
