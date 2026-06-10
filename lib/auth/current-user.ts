import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Role = "staff" | "spv" | "head" | "direksi" | "admin";

export type DivisionMembership = {
  divisionCode: string;
  divisionName: string;
  role: Role;
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  divisions: DivisionMembership[];
  activeDivisionCode: string | null;
  isAdmin: boolean;
  isDireksi: boolean;
};

const ACTIVE_DIVISION_COOKIE = "redigma_active_division";

// cache() memastikan fungsi ini hanya dipanggil SEKALI per request,
// meskipun layout, admin-layout, dan page semuanya memanggil getCurrentUser().
// Tanpa ini, tiap pemanggilan membuat Supabase auth call tersendiri.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getSession() baca JWT dari cookie tanpa network call ke Supabase Auth —
  // menghindari rate limit akibat banyak request paralel di Next.js Turbopack.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authUser = session?.user ?? null;
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, is_active")
    .eq("id", authUser.id)
    .single();

  if (!profile) {
    return {
      id: authUser.id,
      email: authUser.email ?? "",
      fullName: null,
      isActive: true,
      divisions: [],
      activeDivisionCode: null,
      isAdmin: false,
      isDireksi: false,
    };
  }

  const { data: memberships } = await supabase
    .from("user_divisions")
    .select("division_code, role, divisions(code, name, position)")
    .eq("user_id", authUser.id)
    .order("division_code");

  const divisions: DivisionMembership[] = (memberships ?? [])
    .map((m) => {
      const div = Array.isArray(m.divisions) ? m.divisions[0] : m.divisions;
      return {
        divisionCode: m.division_code as string,
        divisionName: (div?.name as string) ?? m.division_code,
        role: m.role as Role,
      };
    })
    .sort((a, b) => a.divisionName.localeCompare(b.divisionName));

  const isAdmin = divisions.some((d) => d.role === "admin");
  const isDireksi = divisions.some((d) => d.role === "direksi");

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_DIVISION_COOKIE)?.value;

  const activeDivisionCode =
    divisions.find((d) => d.divisionCode === cookieValue)?.divisionCode ??
    divisions[0]?.divisionCode ??
    null;

  return {
    id: profile.id as string,
    email: profile.email as string,
    fullName: (profile.full_name as string | null) ?? null,
    isActive: profile.is_active as boolean,
    divisions,
    activeDivisionCode,
    isAdmin,
    isDireksi,
  };
});

export { ACTIVE_DIVISION_COOKIE };
