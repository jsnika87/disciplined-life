import { supabase } from "@/lib/supabaseClient";

const LS_KEY = "dl:lastTimezoneSyncAt";
const LS_TZ_KEY = "dl:lastTimezoneSynced";

function getBrowserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

// throttle so we don’t hit DB every navigation
function shouldSync(tz: string): boolean {
  const lastTz = localStorage.getItem(LS_TZ_KEY);
  const lastAt = Number(localStorage.getItem(LS_KEY) || "0");
  const now = Date.now();

  // If tz changed, sync immediately
  if (lastTz !== tz) return true;

  // Otherwise sync at most once per 24h
  const ONE_DAY = 24 * 60 * 60 * 1000;
  return now - lastAt > ONE_DAY;
}

export async function syncTimezoneOnce(): Promise<void> {
  if (typeof window === "undefined") return;

  const tz = getBrowserTimezone();
  if (!tz) return;

  // must be logged in
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;

  if (!shouldSync(tz)) return;

  const res = await fetch("/api/profile/timezone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ timezone: tz }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    // don’t throw hard — just log
    console.warn("[timezone-sync] failed", res.status, txt);
    return;
  }

  localStorage.setItem(LS_KEY, String(Date.now()));
  localStorage.setItem(LS_TZ_KEY, tz);

  console.log("[timezone-sync] updated:", tz);
}