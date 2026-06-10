import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() baca JWT dari cookie tanpa network call ke Supabase Auth —
  // menghindari rate limit akibat banyak request paralel di Next.js Turbopack.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  const { pathname } = request.nextUrl;

  // ── LMS routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/lms")) {
    const isLmsAuthRoute =
      pathname.startsWith("/lms/login") ||
      pathname.startsWith("/lms/register");

    if (!user && !isLmsAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/lms/login";
      return NextResponse.redirect(url);
    }

    if (user && isLmsAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/lms/dashboard";
      return NextResponse.redirect(url);
    }

    return response;
  }

  // ── Main app routes ──────────────────────────────────────────────────────
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/cek-email") ||
    pathname.startsWith("/auth");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
