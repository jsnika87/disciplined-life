// src/app/api/push/test/route.ts
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

// Configure VAPID once at module load
webpush.setVapidDetails(
  getEnv("VAPID_SUBJECT"),
  getEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  getEnv("VAPID_PRIVATE_KEY")
);

export async function POST(req: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Identify caller from JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Fetch subscriptions for THIS user
    const { data, error } = await admin
      .schema("disciplined")
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json(
        { ok: false, reason: "db_error", message: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, reason: "no_subscriptions" },
        { status: 404 }
      );
    }

    // Send one test push to each subscription
    await Promise.all(
      data.map((row) =>
        webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth,
            },
          },
          JSON.stringify({
            title: "Disciplined Life",
            body: "Test push ✅",
            data: { url: "/today" },
          })
        )
      )
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("push test error:", e);
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}