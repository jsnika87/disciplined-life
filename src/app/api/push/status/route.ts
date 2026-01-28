// src/app/api/push/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ In Next.js route handlers, headers come from the Request object
    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json(
        { subscribed: false, reason: "missing_token" },
        { status: 200 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Identify the user from the provided JWT
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);

    if (userErr || !userData?.user) {
      return NextResponse.json(
        { subscribed: false, reason: "invalid_token" },
        { status: 200 }
      );
    }

    const userId = userData.user.id;

    const { data, error } = await admin
      .schema("disciplined")
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (error) {
      return NextResponse.json(
        { subscribed: false, reason: "db_error", message: error.message },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { subscribed: (data?.length ?? 0) > 0 },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { subscribed: false, reason: "server_error", message: e?.message ?? "unknown" },
      { status: 200 }
    );
  }
}