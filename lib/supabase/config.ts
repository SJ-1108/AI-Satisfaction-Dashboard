/**
 * Supabase 환경변수가 실제 값으로 설정되었는지 확인한다.
 *
 * 단계 1 현재는 실연동이 없으므로, 미설정 상태에서는 "더미 모드"로 동작한다:
 * - 인증을 우회하고 더미 데이터로 화면을 볼 수 있게 한다.
 * 실제 키가 설정되면 자동으로 정상 인증 흐름으로 전환되므로 운영 보안에는 영향이 없다.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  if (url.includes("YOUR-") || key.includes("YOUR-")) return false;
  return url.startsWith("http");
}
