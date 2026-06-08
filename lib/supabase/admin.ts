import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client (service role).
 *
 * PENTING: Hanya boleh dipakai di server-side code (Server Action,
 * Route Handler). JANGAN pernah import file ini dari Client Component.
 * Service role key memberikan akses bypass RLS — kalau bocor ke browser,
 * seluruh database bisa diakses siapapun.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
