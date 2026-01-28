// src/app/api/push/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function jsonNoStore(body: any, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return jsonNoStore({ subscribed: false, reason: "missing_token" }, { status: 200 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const userId = await withTimeout(5000, async () => {
      const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
      if (userErr || !userData?.user) return null;
      return userData.user.id;
    });

    if (!userId) {
      return jsonNoStore({ subscribed: false, reason: "invalid_token" }, { status: 200 });
    }

    const subscribed = await withTimeout(5000, async () => {
      const { data, error } = await admin
        .schema("disciplined")
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (error) return false;
      return (data?.length ?? 0) > 0;
    });

    return jsonNoStore({ subscribed }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message ?? "unknown";
    return jsonNoStore(
      { subscribed: false, reason: msg === "timeout" ? "timeout" : "server_error" },
      { status: 200 }
    );
  }
}