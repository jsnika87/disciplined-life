// src/app/api/settings/reminder/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = need("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
    }
    const userId = userData.user.id;

    const body = await req.json();

    const push_daily_reminder = !!body.push_daily_reminder;
    const daily_reminder_time_min = body.daily_reminder_time_min == null ? null : Number(body.daily_reminder_time_min);

    if (daily_reminder_time_min != null) {
      if (!Number.isFinite(daily_reminder_time_min) || daily_reminder_time_min < 0 || daily_reminder_time_min > 1439) {
        return NextResponse.json({ ok: false, reason: "bad_input", message: "Reminder min must be 0..1439" }, { status: 400 });
      }
    }

    const { data, error } = await admin
      .schema("disciplined")
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          push_daily_reminder,
          daily_reminder_time_min: daily_reminder_time_min ?? 20 * 60,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("timezone,push_enabled,push_fasting_windows,push_daily_reminder,daily_reminder_time_min")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, reason: "db_error", message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userSettings: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}