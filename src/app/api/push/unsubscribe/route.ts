// src/app/api/push/unsubscribe/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Unsubscribe doesn't need a body.
    // Delete ALL subscriptions for this user (simple + reliable).
    const { error } = await admin
      .schema("disciplined")
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);

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