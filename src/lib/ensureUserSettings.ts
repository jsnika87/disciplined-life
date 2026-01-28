import { supabase } from "@/lib/supabaseClient";

function guessTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

export async function ensureUserSettings() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return;
  const uid = data.user?.id;
  if (!uid) return;

  const tz = guessTz();

  // upsert defaults (will not overwrite existing user customizations later)
  await supabase
    .schema("disciplined")
    .from("user_settings")
    .upsert(
      { user_id: uid, timezone: tz, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
}