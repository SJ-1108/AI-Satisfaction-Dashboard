/**
 * DB 테이블 타입 정의 (PRD 5.1 기준).
 * satisfaction ↔ feedback 은 search_event_id 1:1 관계.
 */

/** 평가값 도메인 (PRD 9절 가정: up/down 2종) */
export type Rating = "up" | "down";

/** 불만족 관리 진행 상태 (FR-4.3) */
export type FeedbackStatus = "미확인" | "검토중" | "조치완료" | "보류";

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "미확인",
  "검토중",
  "조치완료",
  "보류",
];

/** satisfaction: 평가 원본 (Metabase 동기화/업로드로 적재) */
export interface Satisfaction {
  search_event_id: string;
  query: string | null;
  summary_text: string | null;
  rating: Rating;
  reason: string | null;
  comment: string | null;
  created_at: string; // ISO timestamptz
  synced_at: string | null;
}

/** feedback: 불만족 관리 내부 피드백 (1:1, 팀 입력) */
export interface Feedback {
  id: string;
  search_event_id: string;
  status: FeedbackStatus;
  detail_reason: string | null;
  cause_category: string | null;
  action: string | null;
  memo: string | null;
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
}
