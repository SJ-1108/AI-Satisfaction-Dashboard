/**
 * DB 테이블 타입 정의.
 * satisfaction ↔ feedback 은 satisfaction.id 1:1 관계 (satisfaction_id).
 * search_event_id(개인정보)는 사용하지 않는다.
 */

/** 평가값 도메인 (up/down 2종) */
export type Rating = "up" | "down";

/**
 * 불만족 관리 진행 상태 (FR-4.3) — DB 저장값(value) 기준.
 * '조치완료'는 기존 DB 호환을 위해 저장값을 유지하고, 화면에는 '처리완료'로 표시한다
 * (표시명은 FEEDBACK_STATUS_LABELS / statusLabel 참조). DB CHECK 제약과 1:1 일치.
 */
export type FeedbackStatus =
  | "미확인"
  | "검토중"
  | "조치완료"
  | "보류"
  | "처리 불가";

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "미확인",
  "검토중",
  "조치완료",
  "보류",
  "처리 불가",
];

/**
 * 상태 저장값(value) → 화면 표시명(label) 매핑.
 * 저장값 '조치완료'는 화면에서 '처리완료'로 보여준다. DB 값은 건드리지 않는다.
 */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  미확인: "미확인",
  검토중: "검토중",
  조치완료: "처리완료",
  보류: "보류",
  "처리 불가": "처리 불가",
};

/** 상태 저장값 → 화면 표시명. 알 수 없는 값은 그대로 반환(방어적). */
export function statusLabel(status: FeedbackStatus): string {
  return FEEDBACK_STATUS_LABELS[status] ?? status;
}

/** 상태별 색상 — 목록 pill·모달 칩·차트 등에서 공용 사용. 대시보드 처리 현황과 통일 */
export const STATUS_COLOR: Record<FeedbackStatus, string> = {
  미확인: "#e2e6ec",
  검토중: "#8fb0f2",
  조치완료: "#2f6bff", // 저장값(화면 표시는 '처리완료')
  보류: "#97a2b4",
  "처리 불가": "#a63a35",
};

/**
 * 배경색 위에 올릴 텍스트 색을 상대 휘도로 자동 선택(solid pill·칩 텍스트).
 * 밝은 배경 → 진한 글자, 어두운 배경 → 흰 글자.
 */
export function statusTextColor(bg: string): string {
  return relativeLuminance(bg) > 0.6 ? "#1a1d23" : "#ffffff";
}

/**
 * 흰 배경 위 텍스트용 색 보정(KPI 숫자 등). 흰 배경에서 충분한 대비를 얻을 때까지
 * 검정 쪽으로 반복해서 섞고(색상 hue 유지), 이미 어두운 색은 그대로 둔다.
 * (검토중 #8fb0f2·보류 #97a2b4 처럼 '중간 밝기' 색도 확실히 진하게 만들어 가독성 확보.)
 */
export function onWhiteText(color: string): string {
  let c = color;
  for (let i = 0; i < 8 && relativeLuminance(c) > 0.3; i++) {
    c = mixToward(c, "#1a1d23", 0.4);
  }
  return c;
}

/** 상태색의 연한 틴트 배경(pill·드롭다운 버튼). 흰색 쪽으로 섞어 옅게. */
export function statusTint(color: string): string {
  return mixToward(color, "#ffffff", 0.8);
}

/**
 * 틴트/흰 배경 위에서 읽히는 진한 상태 텍스트 색.
 * 원색이 밝으면 충분히 어두워질 때까지 검정 쪽으로 반복해서 섞고,
 * 이미 어두운 색(처리완료·처리 불가 등)은 그대로 둔다. 색상(hue)은 유지.
 */
export function statusInk(color: string): string {
  let c = color;
  for (let i = 0; i < 8 && relativeLuminance(c) > 0.4; i++) {
    c = mixToward(c, "#1a1d23", 0.4);
  }
  return c;
}

/** #rgb/#rrggbb → {r,g,b} (0-255). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** sRGB 상대 휘도(0=검정, 1=흰색). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** color 를 target 방향으로 t(0~1) 만큼 섞은 #rrggbb 반환. */
function mixToward(color: string, target: string, t: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(target);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}

/**
 * 외부(DB·엑셀 등) 상태 문자열을 저장값 도메인으로 정규화한다.
 * 과거 표기 '처리완료'가 데이터에 남아 있어도 저장값 '조치완료'로 흡수한다.
 */
export function normalizeStatus(raw: string | null | undefined): FeedbackStatus {
  if (raw === "처리완료") return "조치완료";
  if (raw && (FEEDBACK_STATUSES as string[]).includes(raw)) {
    return raw as FeedbackStatus;
  }
  return "미확인";
}

/**
 * satisfaction: 평가 원본 (엑셀 업로드 누적 / 추후 Metabase 동기화).
 * - id: 내부 식별자(UUID, 개인정보 아님) — feedback 연결키
 * - record_key: 중복 업로드 방지 해시 (UNIQUE)
 * - record_no: 누적 표시번호 (운영/화면용, 식별·연결키로 사용 금지)
 */
export interface Satisfaction {
  id: string;
  record_no: number;
  record_key: string;
  query: string | null;
  summary_text: string | null;
  rating: Rating;
  reason: string | null;
  comment: string | null;
  created_at: string; // ISO timestamptz
  upload_batch_id: string | null;
  synced_at: string | null;
  // 업로드 엑셀 추가 컬럼(선택) — 기기 종류/가드레일.
  // DB 컬럼·업로드 파싱이 아직 없으면 undefined(화면에서 "-"로 표시).
  device_type?: string | null; // Device Type → 기기 종류
  guardrail_label?: string | null; // Guardrail Label → 가드레일
}

/**
 * 업로드 파싱·검증을 통과한 행 (적재 전).
 * id/record_no/upload_batch_id 는 적재 시점(DB 트리거 또는 앱)에서 부여된다.
 */
export interface ParsedSatisfaction {
  record_key: string;
  query: string | null;
  summary_text: string | null;
  rating: Rating;
  reason: string | null;
  comment: string | null;
  created_at: string;
  // 업로드 엑셀 추가 컬럼 — 없거나 비면 null.
  device_type: string | null; // Device Type → 기기 종류
  guardrail_label: string | null; // Guardrail Label → 가드레일
  // ── 아래는 row별 로그(upload_batch_rows)용 부가정보. 클라이언트에서만 사용하고
  //    satisfaction 적재 payload·record_key 계산에는 포함하지 않는다(서버 전송 전 제거). ──
  /** 원본 파일 행 번호(헤더 제외 1-base) */
  row_number?: number;
  /** 원본 행 전체(raw) — 진단/로그용 */
  raw_row?: Record<string, unknown> | null;
}

/** 업로드 row별 처리 결과 종류 — upload_batches 집계와 1:1 대응 */
export type UploadRowAction = "insert" | "update" | "duplicate" | "failed";

/**
 * upload_batch_rows 저장 페이로드(앱 → DB).
 * id / upload_batch_id / created_at 은 저장 시점에 서버가 부여하므로 여기엔 없다.
 */
export interface UploadRowLog {
  row_number: number;
  action: UploadRowAction;
  record_key: string | null;
  satisfaction_id: string | null;
  query: string | null;
  rating: string | null;
  reason: string | null;
  comment: string | null;
  summary_text: string | null;
  feedback_created_at: string | null;
  device_type: string | null;
  guardrail_label: string | null;
  device_type_before: string | null;
  device_type_after: string | null;
  guardrail_label_before: string | null;
  guardrail_label_after: string | null;
  error_message: string | null;
  raw_row: Record<string, unknown> | null;
}

/** upload_batch_rows: 업로드 row별 처리 결과 로그 (DB row 전체) */
export interface UploadBatchRow extends UploadRowLog {
  id: string;
  upload_batch_id: string;
  created_at: string;
}

/** feedback: 불만족 관리 내부 피드백 (satisfaction_id 1:1) */
export interface Feedback {
  id: string;
  satisfaction_id: string; // FK → satisfaction.id
  status: FeedbackStatus;
  detail_reason: string | null;
  cause_category: string | null;
  related_department: string | null; // 유관 부서
  action: string | null;
  memo: string | null;
  /** 표시용 사번 (DB 저장은 uuid, 로드 시 사번으로 변환) */
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** profiles: 계정 (auth.users 연결) */
export interface Profile {
  id: string;
  emp_no: string;
  name: string | null;
  /** 최초 로그인 시 비밀번호 변경 강제 (FR-0.2). 변경 완료 시 false */
  must_change_password: boolean;
}

/** upload_batches: 업로드 이력 */
export interface UploadBatch {
  id: string;
  file_name: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  failed_count: number;
  duplicate_count: number;
  status: string;
  error_message: string | null;
}

/** reset_logs: 데이터 초기화 이력 (감사 로그) */
export interface ResetLog {
  id: string;
  /** 표시용 사번 (DB 저장은 사번, 로드 시 이름으로 변환) */
  reset_by: string | null;
  reset_at: string;
  satisfaction_count: number;
  feedback_count: number;
  batch_count: number;
}

/** 업로드 처리 결과 요약 (화면 표시용) */
export interface UploadSummary {
  file_name: string;
  uploaded_at: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  failed_count: number;
  duplicate_count: number;
}
