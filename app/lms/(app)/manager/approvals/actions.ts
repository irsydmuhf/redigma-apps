"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

export async function approveEnrollment(enrollmentId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_program_enrollments")
    .update({
      status: "active",
      approved_at: new Date().toISOString(),
      approved_by: me.id,
    })
    .eq("id", enrollmentId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  // Init module progress untuk ADV yang baru diapprove
  await admin.rpc("lms_init_module_progress", { p_enrollment_id: enrollmentId });

  redirect("/lms/manager/approvals");
}

export async function rejectEnrollment(enrollmentId: string) {
  const me = await getCurrentLmsUser();
  if (!me || (me.role !== "manager" && me.role !== "admin")) {
    throw new Error("Tidak punya akses.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("lms_program_enrollments")
    .update({ status: "rejected" })
    .eq("id", enrollmentId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  redirect("/lms/manager/approvals");
}
