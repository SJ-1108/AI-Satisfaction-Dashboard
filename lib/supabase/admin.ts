import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service-role 키를 사용하는 관리자 클라이언트 (RLS 우회).
 * 서버 전용 ("server-only" 가드) — 절대 클라이언트 번들에 포함되면 안 된다 (NFR-2).
 * 용도: 수동 업로드 적재(FR-1.2), Metabase 자동 동기화 upsert(FR-1.1), 계정 시드.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
