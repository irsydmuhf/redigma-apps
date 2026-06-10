"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";

export async function generateInviteLink(programId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const token = nanoid(32);
  const admin = createAdminClient();

  const { error } = await admin.from("lms_invite_links").insert({
    program_id: programId,
    token,
    created_by: me.id,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  redirect(`/lms/manager/programs/${programId}/invite?msg=${encodeURIComponent('Link undangan berhasil dibuat')}`);
}

export async function deactivateInviteLink(linkId: string, programId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_invite_links")
    .update({ is_active: false })
    .eq("id", linkId);

  if (error) throw new Error(error.message);
  redirect(`/lms/manager/programs/${programId}/invite?msg=${encodeURIComponent('Link berhasil dinonaktifkan')}`);
}
