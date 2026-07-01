/**
 * 유관 부서 목록 (불만족 피드백 모달의 '유관 부서' 드롭다운).
 *
 * cause_category(원인 분류)와 동일하게 한글 라벨 문자열을 그대로 저장한다(코드 미사용).
 * 고정 목록은 UI(드롭다운)에서만 강제하며 DB 제약은 두지 않는다.
 * 미선택은 "선택"으로 표시하고 DB 에는 null 로 저장한다.
 */
/** 등록된 부서(입력 순서). UI 노출용 정렬은 아래 DEPARTMENTS 에서 처리한다. */
const DEPARTMENTS_RAW: string[] = [
  "컨텐츠기획1팀 국어파트",
  "컨텐츠기획1팀 사회파트",
  "컨텐츠기획2팀 수학파트",
  "컨텐츠기획2팀 과학파트",
  "컨텐츠기획3팀 상품파트",
  "컨텐츠기획3팀 영어파트",
  "고12컨텐츠기획팀",
  "고12기획파트",
  "고12내신파트",
  "서비스기획팀 운영파트",
  "서비스기획팀 모바일파트",
  "플랫폼기획팀 1파트",
  "플랫폼기획팀 2파트",
  "마케팅1팀 광고파트",
  "마케팅1팀 프로모션파트",
  "마케팅2팀 CRM파트",
  "마케팅2팀 제휴마케팅파트",
  "학습지원팀 서비스지원파트",
  "학습지원팀 학습지원파트",
  "학습지원팀 서비스운영파트",
  "출판운영팀",
  "입시컨텐츠팀",
  "입시서비스팀 데이터파트",
  "입시서비스팀 기획파트",
  "마이스",
];

/** 가나다순 정렬(한국어 콜레이션). 새 부서를 추가해도 자동 정렬된다. */
export const DEPARTMENTS: string[] = [...DEPARTMENTS_RAW].sort((a, b) =>
  a.localeCompare(b, "ko"),
);

/** 드롭다운 미선택 라벨 (value="" = null 저장) */
export const DEPARTMENT_UNSET_LABEL = "선택";

/** Dropdown 옵션: 맨 앞 "선택"(value="") + 각 부서(label=value) */
export const DEPARTMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: DEPARTMENT_UNSET_LABEL },
  ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
];
