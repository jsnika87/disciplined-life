import { supabase } from "@/lib/supabaseClient";

export async function syncTimezoneIfNeeded() {
  if (typeof window === "undefined") return;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz) return;

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;

  const { data: profile, error: selectErr } = await supabase
    .schema("disciplined")
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle<{ timezone: string | null }>();

  if (selectErr) {
    console.warn("[timezone] select failed:", selectErr.message);
    return;
  }

  if (profile?.timezone === tz) return;

  const { error: updateErr } = await supabase
    .schema("disciplined")
    .from("profiles")
    .update({
      timezone: tz,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateErr) {
    console.warn("[timezone] update failed:", updateErr.message);
  } else {
    console.log("[timezone] set to", tz);
  }
}