/**
 * 원인 분류(cause_category) 정본 목록.
 * cause_category 는 free text 로 저장되며, 이 목록은 UI(모달 칩·필터 드롭다운)에서만 강제한다.
 * status 와 달리 DB CHECK 제약은 두지 않는다(기존 값 호환·자유 입력 허용).
 */
export const CAUSE_CATEGORIES = [
  "데이터 없음",
  "데이터 부족·보완",
  "사실 오류",
  "기능 개선",
  "질의 의도 불일치",
  "AI 개발 이슈",
  "기타",
] as const;

/**
 * 원인 분류별 통계 도넛 색상 팔레트 (순환) — 테라코타→샌드 그라데이션(진→연) 8단계.
 * 대시보드 원인 분류 도넛과 통일.
 */
export const CAUSE_CHART_COLORS = [
  "#8f4a33",
  "#a55f42",
  "#b77452",
  "#c68a68",
  "#d29f80",
  "#dbb298",
  "#e3c4ac",
  "#e9d2be",
];
