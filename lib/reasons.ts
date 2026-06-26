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

/**
 * 화면 공통 사유 표시 순서(단일 기준).
 * 대시보드 그래프·/records·/feedback 의 사유 항목 순서를 이 순서로 통일한다.
 * "기타"(other)는 항상 가장 하단.
 */
export const REASON_ORDER = [
  "inappropriate", // 부적절한 답변
  "not_factual", // 사실과 다름
  "intent_mismatch", // 의도 불일치
  "insufficient", // 정보 부족
  "outdated", // 최신 정보 아님
  "other", // 기타 (항상 최하단)
] as const;

/** 사유 드롭다운/그래프 공통 옵션 (고정 순서, "미지정" 제외) */
export const REASON_OPTIONS: { value: string; label: string }[] =
  REASON_ORDER.map((code) => ({ value: code, label: REASON_LABELS[code] }));

/**
 * 정렬용 순서 인덱스. REASON_ORDER 기준이며,
 * "기타"는 항상 최하단, 미매핑/미지정(__unset__ 등)은 기타 바로 앞에 둔다.
 */
export function reasonOrderIndex(code: string | null | undefined): number {
  if (code === "other") return 1000;
  const i = REASON_ORDER.indexOf(code as (typeof REASON_ORDER)[number]);
  return i === -1 ? 900 : i;
}

/** reason 코드를 한글 라벨로. 매핑이 없으면 코드값을 그대로 반환. */
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return REASON_UNSET_LABEL;
  return REASON_LABELS[code] ?? code;
}
