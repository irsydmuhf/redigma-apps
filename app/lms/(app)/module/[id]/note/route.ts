import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: moduleId } = await params;

  const me = await getCurrentLmsUser();
  if (!me || me.role !== "adv") return new Response("Forbidden", { status: 403 });

  let body: { enrollmentId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const enrollmentId = String(body.enrollmentId ?? "");
  const content = String(body.content ?? "");
  if (!enrollmentId) return new Response("Bad request", { status: 400 });

  const admin = createAdminClient();

  // Verifikasi enrollment milik user ini.
  const { data: enr } = await admin
    .from("lms_program_enrollments")
    .select("user_id")
    .eq("id", enrollmentId)
    .single();
  if (!enr || enr.user_id !== me.id) return new Response("Forbidden", { status: 403 });

  const { error } = await admin.from("lms_module_notes").upsert(
    { enrollment_id: enrollmentId, module_id: moduleId, content, updated_at: new Date().toISOString() },
    { onConflict: "enrollment_id,module_id" }
  );
  if (error) return new Response(error.message, { status: 500 });

  return new Response(null, { status: 204 });
}
