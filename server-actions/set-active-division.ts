"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_DIVISION_COOKIE, getCurrentUser } from "@/lib/auth/current-user";

export async function setActiveDivision(divisionCode: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, error: "Belum login." };
  }

  const allowed = user.divisions.some((d) => d.divisionCode === divisionCode);
  if (!allowed) {
    return {
      ok: false as const,
      error: "Anda tidak punya akses ke divisi tersebut.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_DIVISION_COOKIE, divisionCode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}
