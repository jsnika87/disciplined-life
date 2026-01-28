// src/app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

type NestedBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  userAgent?: string;
};

type FlatBody = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string;
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 401 });
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    // Accept BOTH payload shapes:
    // 1) { subscription: { endpoint, keys: {p256dh, auth} }, userAgent }
    // 2) { endpoint, p256dh, auth, userAgent }
    const nested = body as NestedBody;
    const flat = body as FlatBody;

    const endpoint =
      nested?.subscription?.endpoint ??
      (typeof flat?.endpoint === "string" ? flat.endpoint : undefined);

    const p256dh =
      nested?.subscription?.keys?.p256dh ??
      (typeof flat?.p256dh === "string" ? flat.p256dh : undefined);

    const auth =
      nested?.subscription?.keys?.auth ??
      (typeof flat?.auth === "string" ? flat.auth : undefined);

    const userAgent =
      typeof nested?.userAgent === "string"
        ? nested.userAgent
        : typeof flat?.userAgent === "string"
          ? flat.userAgent
          : null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { ok: false, reason: "missing_subscription", received: body },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { error } = await admin
      .schema("disciplined")
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      return NextResponse.json(
        { ok: false, reason: "db_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? "unknown" },
      { status: 500 }
    );
  }
}