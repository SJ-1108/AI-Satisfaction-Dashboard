import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * 서버 컴포넌트/Route Handler 용 Supabase 클라이언트.
 * anon 키 + 로그인 사용자 쿠키 세션을 사용하므로 RLS가 적용된다.
 * (관리자 권한 적재가 필요하면 admin.ts 의 service-role 클라이언트를 쓴다.)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출되면 set이 무시될 수 있다.
            // 세션 갱신은 middleware가 담당하므로 안전하게 무시한다.
          }
        },
      },
    },
  );
}
