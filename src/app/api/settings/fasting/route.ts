// src/app/api/settings/fasting/route.ts
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
    const eating_start = String(body.eating_start || "").trim(); // "HH:MM"
    const eating_hours = Number(body.eating_hours);

    const notify_window_start = !!body.notify_window_start;
    const notify_window_end = !!body.notify_window_end;

    if (!/^\d{1,2}:\d{2}$/.test(eating_start)) {
      return NextResponse.json({ ok: false, reason: "bad_input", message: "Start must be HH:MM" }, { status: 400 });
    }
    if (!Number.isFinite(eating_hours) || eating_hours < 1 || eating_hours > 23) {
      return NextResponse.json({ ok: false, reason: "bad_input", message: "Hours must be 1..23" }, { status: 400 });
    }

    // upsert fasting_settings
    const { data, error } = await admin
      .schema("disciplined")
      .from("fasting_settings")
      .upsert(
        {
          user_id: userId,
          eating_start,
          eating_hours,
          notify_window_start,
          notify_window_end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("eating_start,eating_hours,notify_window_start,notify_window_end")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, reason: "db_error", message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, fasting: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}