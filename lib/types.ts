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
export type FeedbackStatus = "미확인" | "검토중" | "조치완료" | "보류";

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "미확인",
  "검토중",
  "조치완료",
  "보류",
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
};

/** 상태 저장값 → 화면 표시명. 알 수 없는 값은 그대로 반환(방어적). */
export function statusLabel(status: FeedbackStatus): string {
  return FEEDBACK_STATUS_LABELS[status] ?? status;
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
}

/** feedback: 불만족 관리 내부 피드백 (satisfaction_id 1:1) */
export interface Feedback {
  id: string;
  satisfaction_id: string; // FK → satisfaction.id
  status: FeedbackStatus;
  detail_reason: string | null;
  cause_category: string | null;
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
