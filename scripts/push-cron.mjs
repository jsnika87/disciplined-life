import "dotenv/config";
import { DateTime } from "luxon";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");

const VAPID_PUBLIC = need("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = need("VAPID_PRIVATE_KEY");

webpush.setVapidDetails("mailto:admin@disciplined.life", VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function toSubscriptionRow(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

function mod1440(n) {
  return ((n % 1440) + 1440) % 1440;
}

async function alreadySent(userId, kind, localDate) {
  const { data, error } = await admin
    .schema("disciplined")
    .from("push_send_log")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("local_date", localDate)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function markSent(userId, kind, localDate, localMin) {
  const { error } = await admin
    .schema("disciplined")
    .from("push_send_log")
    .insert({ user_id: userId, kind, local_date: localDate, local_min: localMin });

  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

async function fetchUserSettings() {
  const { data, error } = await admin
    .schema("disciplined")
    .from("user_settings")
    .select(
      "user_id,timezone,eating_start_min,eating_end_min,push_enabled,push_fasting_windows,push_daily_reminder,daily_reminder_time_min"
    );

  if (error) throw error;
  return data ?? [];
}

async function fetchUserSubscription(userId) {
  const { data, error } = await admin
    .schema("disciplined")
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function sendPush(userId, payload) {
  const subRow = await fetchUserSubscription(userId);
  if (!subRow) return { ok: false, reason: "no_subscription" };

  try {
    await webpush.sendNotification(toSubscriptionRow(subRow), JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "send_failed", message: e?.message ?? String(e) };
  }
}

async function areAllPillarsCompletedToday(userId, localDateISO, tz) {
  // v1 compatibility with your current UTC-based entry_date
  const noonLocal = DateTime.fromISO(localDateISO, { zone: tz }).set({ hour: 12, minute: 0 });
  const utcDate = noonLocal.toUTC().toISODate(); // YYYY-MM-DD

  const { data: entry, error: entryErr } = await admin
    .schema("disciplined")
    .from("daily_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", utcDate)
    .maybeSingle();

  if (entryErr) throw entryErr;
  if (!entry?.id) return false;

  const { data: pillars, error: pilErr } = await admin
    .schema("disciplined")
    .from("daily_pillars")
    .select("pillar,completed")
    .eq("entry_id", entry.id);

  if (pilErr) throw pilErr;

  const needed = new Set(["train", "eat", "word", "freedom"]);
  for (const row of pillars ?? []) if (row.completed === true) needed.delete(row.pillar);
  return needed.size === 0;
}

async function main() {
  const users = await fetchUserSettings();
  let sentCount = 0;

  for (const u of users) {
    if (!u.push_enabled) continue;

    const tz = u.timezone || "America/Chicago";
    const now = DateTime.now().setZone(tz);

    const localDate = now.toISODate();
    const localMin = now.hour * 60 + now.minute;

    // (1) Fasting/Eating window transitions + 30-min warning
    if (u.push_fasting_windows) {
      const startMin = Number(u.eating_start_min);
      const endMin = Number(u.eating_end_min);

      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
        // if settings are missing/invalid, skip safely
      } else {
        // If endMin < startMin, the eating window crosses midnight.
        // For notifications happening after midnight (localMin < endMin),
        // log against "yesterday" to avoid double-send in the new date.
        const windowKeyDate =
          endMin < startMin && localMin < endMin ? now.minus({ days: 1 }).toISODate() : localDate;

        // A) Eating window opened
        if (localMin === startMin) {
          const kind = "window_start";
          if (!(await alreadySent(u.user_id, kind, windowKeyDate))) {
            const res = await sendPush(u.user_id, {
              title: "Eating window is open",
              body: "You’re in your eating window now.",
              data: { url: "/today" },
            });
            if (res.ok) {
              await markSent(u.user_id, kind, windowKeyDate, localMin);
              sentCount++;
            }
          }
        }

        // B) Eating window ends soon (30 min before end)
        const warnMin = mod1440(endMin - 30);
        if (localMin === warnMin) {
          const kind = "window_ending_soon";
          if (!(await alreadySent(u.user_id, kind, windowKeyDate))) {
            const res = await sendPush(u.user_id, {
              title: "Eating window ends soon",
              body: "30 minutes left in your eating window.",
              data: { url: "/today" },
            });
            if (res.ok) {
              await markSent(u.user_id, kind, windowKeyDate, localMin);
              sentCount++;
            }
          }
        }

        // C) Fasting window started (eating window ended)
        if (localMin === endMin) {
          const kind = "window_end";
          if (!(await alreadySent(u.user_id, kind, windowKeyDate))) {
            const res = await sendPush(u.user_id, {
              title: "Fasting window started",
              body: "Eating window closed. You’re fasting now.",
              data: { url: "/today" },
            });
            if (res.ok) {
              await markSent(u.user_id, kind, windowKeyDate, localMin);
              sentCount++;
            }
          }
        }
      }
    }

    // (2) Daily reminder if incomplete
    if (u.push_daily_reminder) {
      if (localMin === u.daily_reminder_time_min) {
        const kind = "daily_reminder";
        if (!(await alreadySent(u.user_id, kind, localDate))) {
          const allDone = await areAllPillarsCompletedToday(u.user_id, localDate, tz);
          if (!allDone) {
            const res = await sendPush(u.user_id, {
              title: "Finish strong today",
              body: "You still have pillars to complete.",
              data: { url: "/today" },
            });
            if (res.ok) {
              await markSent(u.user_id, kind, localDate, localMin);
              sentCount++;
            }
          } else {
            // mark so we don't re-check on retries
            await markSent(u.user_id, kind, localDate, localMin);
          }
        }
      }
    }
  }

  console.log(`push-cron complete. sent=${sentCount}`);
}

main().catch((e) => {
  console.error("push-cron failed:", e);
  process.exit(1);
});