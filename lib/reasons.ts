/**
 * reason 코드 ↔ 한글 라벨 매핑 (PRD 11절 오픈 이슈).
 *
 * ⚠️ 미확정 항목: 실제 코드 목록과 한글 라벨은 팀 확정 후 채운다.
 * 매핑에 없는 코드는 코드값 그대로 표시한다 (reasonLabel 의 폴백).
 */
export const REASON_LABELS: Record<string, string> = {
  // 예시 (PRD 11절): insufficient → "정보 부족"
  insufficient: "정보 부족",
  // TODO: 팀 확정 후 코드↔라벨 추가
};

/** reason 코드를 한글 라벨로. 매핑이 없으면 코드값을 그대로 반환. */
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return "(미지정)";
  return REASON_LABELS[code] ?? code;
}
