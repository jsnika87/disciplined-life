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

export async function POST(request: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = request.headers.get("authorization");
    const accessToken =
      authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return jsonNoStore({ ok: false, reason: "missing_token" }, { status: 401 });
    }

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const nested = body as NestedBody;
    const flat = body as FlatBody;

    // Accept BOTH payload shapes:
    // 1) { subscription: { endpoint, keys: {p256dh, auth} }, userAgent }
    // 2) { endpoint, p256dh, auth, userAgent }
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
      // Don’t echo full payload back (can be large + not necessary)
      return jsonNoStore(
        {
          ok: false,
          reason: "missing_subscription",
          received: {
            hasEndpoint: !!endpoint,
            hasP256dh: !!p256dh,
            hasAuth: !!auth,
          },
        },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Keep this endpoint snappy. If Supabase is slow, don’t hang the PWA.
    const userId = await withTimeout(5000, async () => {
      const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
      if (userErr || !userData?.user) throw new Error("invalid_token");
      return userData.user.id;
    }).catch((e: any) => {
      if (e?.message === "invalid_token") return null;
      throw e;
    });

    if (!userId) {
      return jsonNoStore({ ok: false, reason: "invalid_token" }, { status: 401 });
    }

    const now = new Date().toISOString();

    const upsertResult = await withTimeout(5000, async () => {
      return await admin
        .schema("disciplined")
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint,
            p256dh,
            auth,
            user_agent: userAgent,
            updated_at: now,
          },
          { onConflict: "endpoint" }
        );
    });

    if (upsertResult.error) {
      return jsonNoStore(
        { ok: false, reason: "db_error", message: upsertResult.error.message },
        { status: 500 }
      );
    }

    return jsonNoStore({ ok: true }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message ?? "unknown";
    const status = msg === "timeout" ? 504 : 500;

    return jsonNoStore(
      { ok: false, reason: msg === "timeout" ? "timeout" : "server_error", message: msg },
      { status }
    );
  }
}