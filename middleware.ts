// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    // Refresh session cookies when needed, but NEVER block navigation if it fails.
    await supabase.auth.getUser();
  } catch {
    // ignore
  }

  return response;
}

/**
 * IMPORTANT:
 * Do NOT run middleware on:
 * - /api/* (prevents auth/cookie churn during fetches)
 * - service worker + manifest + icons (prevents iOS “brick” mixed-state)
 * - Next static assets
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|favicon-|robots.txt|sitemap.xml|sw.js|manifest.webmanifest|icons/|apple-touch-icon).*)",
  ],
};