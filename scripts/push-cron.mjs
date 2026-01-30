import fs from "fs";
import path from "path";
import { DateTime } from "luxon";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron/one-off node runs do NOT automatically get Next's env loading.
 * So we load .env.local (and .env) ourselves, but only to fill missing vars.
 */
function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();

      // Strip optional quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // Only set if not already present in the environment
      if (!process.env[key] && key) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    // Don't crash cron due to env parsing
    console.warn(`[push-cron] env load failed for ${filePath}:`, e?.message ?? String(e));
  }
}

function ensureEnvLoaded() {
  // Prefer project root near this file
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadEnvFile(path.join(projectRoot, ".env.local"));
  loadEnvFile(path.join(projectRoot, ".env"));

  // Also try cwd if someone runs from elsewhere
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
}

ensureEnvLoaded();

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");

const VAPID_PUBLIC = need("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = need("VAPID_PRIVATE_KEY");

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@disciplined.life";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function toSubscriptionRow(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
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

  // allow idempotency if you added a unique constraint
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

/**
 * If cron runs every 5 minutes, exact-minute equality checks will miss events.
 * This returns true if we're within the last N minutes (including exact minute).
 */
function isWithinLastMinutes(nowMin, targetMin, windowSize) {
  if (typeof targetMin !== "number" || !Number.isFinite(targetMin)) return false;
  const DAY = 1440;
  // diff in [0..1439] where diff=0 means exact match, diff=1 means 1 min after, etc.
  const diff = (nowMin - targetMin + DAY) % DAY;
  return diff >= 0 && diff < windowSize;
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

  // Must match your cron: */5
  const CRON_WINDOW_MINUTES = 5;

  for (const u of users) {
    if (!u.push_enabled) continue;

    const tz = u.timezone || "America/Chicago";
    const now = DateTime.now().setZone(tz);

    const localDate = now.toISODate();
    const localMinNow = now.hour * 60 + now.minute;

    // (1) Fasting/Eating window transitions
    if (u.push_fasting_windows) {
      if (isWithinLastMinutes(localMinNow, u.eating_start_min, CRON_WINDOW_MINUTES)) {
        const kind = "window_start";
        if (!(await alreadySent(u.user_id, kind, localDate))) {
          const res = await sendPush(u.user_id, {
            title: "Eating window is open",
            body: "You’re in your eating window now.",
            data: { url: "/today" },
          });
          if (res.ok) {
            // store the intended minute, not “now”
            await markSent(u.user_id, kind, localDate, u.eating_start_min);
            sentCount++;
          }
        }
      }

      if (isWithinLastMinutes(localMinNow, u.eating_end_min, CRON_WINDOW_MINUTES)) {
        const kind = "window_end";
        if (!(await alreadySent(u.user_id, kind, localDate))) {
          const res = await sendPush(u.user_id, {
            title: "Fasting window started",
            body: "Eating window closed. You’re fasting now.",
            data: { url: "/today" },
          });
          if (res.ok) {
            await markSent(u.user_id, kind, localDate, u.eating_end_min);
            sentCount++;
          }
        }
      }
    }

    // (2) Daily reminder if incomplete
    if (u.push_daily_reminder) {
      if (isWithinLastMinutes(localMinNow, u.daily_reminder_time_min, CRON_WINDOW_MINUTES)) {
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
              await markSent(u.user_id, kind, localDate, u.daily_reminder_time_min);
              sentCount++;
            }
          } else {
            // mark so we don't re-check on retries
            await markSent(u.user_id, kind, localDate, u.daily_reminder_time_min);
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