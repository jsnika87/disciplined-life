// src/lib/ensureUserSettings.ts
import { supabase } from "@/lib/supabaseClient";

function guessTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

export async function ensureUserSettings() {
  try {
    // Prefer session on client (fast, local). Avoids extra auth fetches during SW weirdness.
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return;

    const tz = guessTz();

    const { error } = await supabase
      .schema("disciplined")
      .from("user_settings")
      .upsert(
        { user_id: uid, timezone: tz, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    // Don’t throw — this should never brick the UI.
    if (error) {
      console.warn("ensureUserSettings upsert failed:", error.message);
    }
  } catch (e: any) {
    console.warn("ensureUserSettings failed:", e?.message ?? e);
  }
}