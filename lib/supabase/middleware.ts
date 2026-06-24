import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * 모든 요청에서 Supabase 세션을 갱신하고 접근을 통제한다 (FR-0.4 / NFR-1).
 * - 미인증 사용자는 /login 으로 리다이렉트.
 * - 인증 사용자가 /login 에 접근하면 /dashboard 로 리다이렉트.
 */
export async function updateSession(request: NextRequest) {
  // 더미 모드(Supabase 미설정): 인증을 우회하고 모든 요청을 통과시킨다.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 는 토큰을 서버에서 검증하므로 보안상 getSession() 보다 안전하다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname.startsWith("/login");

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
