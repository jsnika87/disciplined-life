// src/app/api/profile/status/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error: userErr } = await withTimeout(8000, async () => {
      return await supabase.auth.getUser();
    });

    const user = data?.user ?? null;

    if (userErr || !user) {
      return jsonNoStore({ ok: false, reason: "not_authenticated" }, { status: 401 });
    }

    const prof = await withTimeout(8000, async () => {
      return await supabase
        .schema("disciplined")
        .from("profiles")
        .select("id, role, approved, email")
        .eq("id", user.id)
        .single();
    });

    const profile = prof.data ?? null;

    if (prof.error || !profile) {
      return jsonNoStore({
        ok: true,
        userId: user.id,
        role: "pending",
        approved: false,
        reason: prof.error?.message ?? "missing_profile",
      });
    }

    return jsonNoStore({
      ok: true,
      userId: user.id,
      role: profile.role,
      approved: !!profile.approved,
      email: profile.email ?? null,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg === "timeout") {
      return jsonNoStore({ ok: false, reason: "timeout" }, { status: 200 });
    }

    return jsonNoStore(
      { ok: false, reason: "server_error", message: msg },
      { status: 500 }
    );
  }
}