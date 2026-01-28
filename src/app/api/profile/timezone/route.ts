import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = need("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const timezone = typeof body?.timezone === "string" ? body.timezone : "";

    if (!timezone) {
      return NextResponse.json({ ok: false, reason: "missing_timezone" }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Identify user from JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Update profile timezone (profiles.id is uuid)
    const { error: updErr } = await admin
      .schema("disciplined")
      .from("profiles")
      .update({
        timezone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updErr) {
      return NextResponse.json(
        { ok: false, reason: "db_error", message: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, timezone }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? "unknown" },
      { status: 500 }
    );
  }
}