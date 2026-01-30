// scripts/push-cron.mjs
import fs from "fs";
import path from "path";
import { DateTime } from "luxon";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron runs do NOT automatically load Next's env.
 * Load .env.local / .env manually (only fill missing vars).
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

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (!process.env[key] && key) process.env[key] = val;
    }
  } catch (e) {
    console.warn(`[push-cron] env load failed for ${filePath}:`, e?.message ?? String(e));
  }
}

function ensureEnvLoaded() {
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadEnvFile(path.join(projectRoot, ".env.local"));
  loadEnvFile(path.join(projectRoot, ".env"));
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

// keep subject stable
webpush.setVapidDetails("mailto:admin@disciplined.life", VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function toSubscriptionRow(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
}

function mod1440(n) {
  return ((n % 1440) + 1440) % 1440;
}

function timeToMinutes(timeStr) {
  // accepts "HH:MM" or "HH:MM:SS"
  const parts = String(timeStr || "").split(":");
  const hh = Number(parts[0] || 0);
  const mm = Number(parts[1] || 0);
  return mod1440(hh * 60 + mm);
}

function localMinuteNow(now) {
  return mod1440(now.hour * 60 + now.minute);
}

/**
 * Cron runs every 5 minutes.
 * If we only check "==", we can miss events if execution drifts.
 * So treat a 5-min window as eligible: (localMin - target) in [0..4]
 */
function inLastWindow(localMin, targetMin, windowSize = 5) {
  const diff = mod1440(localMin - targetMin);
  return diff >= 0 && diff < windowSize;
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

/**
 * SINGLE SOURCE OF TRUTH:
 * - timezone + push toggles come from user_settings
 * - fasting window time/flags come from fasting_settings
 *
 * This fixes the mismatch you hit (fasting_settings changed, user_settings mins didn’t).
 */
async function fetchUsersForPush() {
  const { data, error } = await admin
    .schema("disciplined")
    .from("user_settings")
    .select(
      "user_id,timezone,push_enabled,push_daily_reminder,daily_reminder_time_min,push_fasting_windows"
    );

  if (error) throw error;
  const users = data ?? [];

  // pull fasting_settings for those users (one query)
  const userIds = users.map((u) => u.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const { data: fsData, error: fsErr } = await admin
    .schema("disciplined")
    .from("fasting_settings")
    .select("user_id,eating_start,eating_hours,notify_window_start,notify_window_end")
    .in("user_id", userIds);

  if (fsErr) throw fsErr;

  const fsByUser = new Map();
  for (const row of fsData ?? []) fsByUser.set(row.user_id, row);

  return users.map((u) => ({
    ...u,
    fasting: fsByUser.get(u.user_id) || null,
  }));
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
  const users = await fetchUsersForPush();
  let sentCount = 0;

  for (const u of users) {
    if (!u.push_enabled) continue;

    const tz = u.timezone || "America/Chicago";
    const now = DateTime.now().setZone(tz);
    const localDate = now.toISODate();
    const localMin = localMinuteNow(now);

    // --- (1) Fasting/Eating window transitions ---
    // Must have fasting settings row
    const fsRow = u.fasting;
    if (u.push_fasting_windows && fsRow) {
      const startMin = timeToMinutes(fsRow.eating_start);
      const hours = Number(fsRow.eating_hours || 0);
      const endMin = mod1440(startMin + hours * 60);

      // Start notification
      if (fsRow.notify_window_start && inLastWindow(localMin, startMin, 5)) {
        const kind = "window_start";
        if (!(await alreadySent(u.user_id, kind, localDate))) {
          const res = await sendPush(u.user_id, {
            title: "Eating window is open",
            body: "You’re in your eating window now.",
            data: { url: "/today" },
          });
          if (res.ok) {
            await markSent(u.user_id, kind, localDate, localMin);
            sentCount++;
          }
        }
      }

      // End notification
      if (fsRow.notify_window_end && inLastWindow(localMin, endMin, 5)) {
        const kind = "window_end";
        if (!(await alreadySent(u.user_id, kind, localDate))) {
          const res = await sendPush(u.user_id, {
            title: "Fasting window started",
            body: "Eating window closed. You’re fasting now.",
            data: { url: "/today" },
          });
          if (res.ok) {
            await markSent(u.user_id, kind, localDate, localMin);
            sentCount++;
          }
        }
      }
    }

    // --- (2) daily reminder if incomplete ---
    if (u.push_daily_reminder && Number.isFinite(u.daily_reminder_time_min)) {
      const reminderMin = Number(u.daily_reminder_time_min);

      if (inLastWindow(localMin, reminderMin, 5)) {
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