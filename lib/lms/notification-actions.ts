"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

/** Tandai satu notifikasi sebagai dibaca lalu arahkan ke link tujuannya. */
export async function markReadAndGo(notificationId: string, link: string) {
  const me = await getCurrentLmsUser();
  if (me) {
    const admin = createAdminClient();
    await admin
      .from("lms_notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", me.id);
  }
  redirect(link && link.startsWith("/") ? link : "/lms/dashboard");
}

/** Tandai semua notifikasi user sebagai dibaca. */
export async function markAllNotificationsRead() {
  const me = await getCurrentLmsUser();
  if (!me) return;
  const admin = createAdminClient();
  await admin
    .from("lms_notifications")
    .update({ is_read: true })
    .eq("user_id", me.id)
    .eq("is_read", false);
  // Tanpa redirect: server action otomatis me-refresh route saat ini → badge update.
}
