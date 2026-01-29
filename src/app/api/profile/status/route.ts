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
      return NextResponse.json(
        { ok: false, reason: "not_authenticated" },
        { status: 401 }
      );
    }

    // Because supabaseServer client now defaults to disciplined schema,
    // this targets disciplined.profiles even without `.schema("disciplined")`
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, role, approved, email")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      // Missing or unreadable profile -> treat as pending (safe)
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