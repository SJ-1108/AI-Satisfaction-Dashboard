/**
 * reason 코드 ↔ 한글 라벨 매핑.
 *
 * DB 에는 코드값(insufficient 등)을 그대로 저장하고, 화면 표시만 한글 라벨로 변환한다.
 * 매핑에 없는 코드는 코드값을 그대로 표시한다(reasonLabel 의 폴백).
 * null / 빈 값 / 미지정은 "미지정" 으로 표시한다.
 */
export const REASON_LABELS: Record<string, string> = {
  insufficient: "정보 부족",
  inappropriate: "부적절한 답변",
  intent_mismatch: "의도 불일치",
  outdated: "최신 정보 아님",
  other: "기타",
  not_factual: "사실과 다름",
};

/** null/빈 값/미지정 reason 의 표시 라벨 */
export const REASON_UNSET_LABEL = "미지정";

/** reason 코드를 한글 라벨로. 매핑이 없으면 코드값을 그대로 반환. */
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return REASON_UNSET_LABEL;
  return REASON_LABELS[code] ?? code;
}
