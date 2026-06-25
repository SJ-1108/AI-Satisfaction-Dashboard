/**
 * 사번 ↔ 내부 이메일 변환 (FR-0.1).
 *
 * 사용자에게는 "사번"만 입력받지만, Supabase Auth 는 이메일이 필요하므로
 * 로그인 직전에만 내부적으로 이메일로 변환한다. 이메일은 UI에 노출하지 않는다.
 *
 *   예) ms20812 → ms20812@megastudyedu.com
 *
 * 도메인은 NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN 으로 분리되어 추후 변경 가능하다.
 */
export const INTERNAL_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN ?? "megastudyedu.com";

/** 사번 문자열을 내부 이메일로 변환한다. */
export function empNoToEmail(empNo: string): string {
  return `${empNo.trim()}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** 내부 이메일에서 사번만 추출한다 (표시용 폴백). */
export function emailToEmpNo(email: string): string {
  return email.split("@")[0] ?? email;
}
