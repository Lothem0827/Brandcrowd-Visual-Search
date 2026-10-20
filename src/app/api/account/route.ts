import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Deletes the signed-in auth user. Cascade wipes profile, boards, follows, and settings. */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
