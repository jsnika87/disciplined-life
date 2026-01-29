// src/app/api/profile/status/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, reason: "not_authenticated" }, { status: 401 });
    }

    // ✅ IMPORTANT: explicitly query disciplined schema
    const { data: profile, error: profErr } = await supabase
      .schema("disciplined")
      .from("profiles")
      .select("id, role, approved, email")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json({
        ok: true,
        userId: user.id,
        role: "pending",
        approved: false,
        reason: profErr?.message ?? "missing_profile",
      });
    }

    return NextResponse.json({
      ok: true,
      userId: user.id,
      role: profile.role,
      approved: !!profile.approved,
      email: profile.email ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, reason: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}