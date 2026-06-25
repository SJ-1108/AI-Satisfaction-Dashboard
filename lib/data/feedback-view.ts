import type { Feedback, FeedbackStatus, Satisfaction } from "@/lib/types";
import { computeDisplayNo } from "@/lib/data/display-no";

/**
 * 불만족(down) 평가 ↔ feedback 1:1 조인 뷰 (FR-4).
 * 연결키는 satisfaction.id ↔ feedback.satisfaction_id.
 * feedback 이 아직 없는 down 건은 가상 "미확인" 행으로 채운다(hasFeedback=false).
 */

/** 화면 표시용 조인 행: 평가 원본 + 피드백(없으면 가상 미확인) */
export interface FeedbackRow {
  // 평가 원본 (satisfaction)
  satisfaction_id: string; // = satisfaction.id (feedback 연결키)
  record_no: number; // 화면 표시용 누적 번호(display No., created_at 과거순 1..N)
  query: string | null;
  summary_text: string | null;
  reason: string | null;
  comment: string | null;
  created_at: string;

  // 피드백 (feedback) — 없으면 가상 기본값
  hasFeedback: boolean;
  status: FeedbackStatus;
  detail_reason: string | null;
  cause_category: string | null;
  action: string | null;
  memo: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/** down 평가 + feedback 을 조인해 화면용 행 배열로 만든다. */
export function buildFeedbackRows(
  satisfaction: Satisfaction[],
  feedback: Feedback[],
): FeedbackRow[] {
  const byId = new Map<string, Feedback>();
  for (const f of feedback) byId.set(f.satisfaction_id, f);

  // 불만족 관리 전용 No.: rating=down 건만 대상으로 평가시각 과거순 1..N (과거=1).
  // 전체 satisfaction 의 display_no 와 무관한 독립 넘버링. (필터와 무관하게 고정)
  const downRecords = satisfaction.filter((s) => s.rating === "down");
  const displayNo = computeDisplayNo(downRecords);

  const rows = downRecords.map((s) => {
    const f = byId.get(s.id);
    return {
      satisfaction_id: s.id,
      record_no: displayNo.get(s.id) ?? 0,
      query: s.query,
      summary_text: s.summary_text,
      reason: s.reason,
      comment: s.comment,
      created_at: s.created_at,

      hasFeedback: Boolean(f),
      status: f?.status ?? "미확인",
      detail_reason: f?.detail_reason ?? null,
      cause_category: f?.cause_category ?? null,
      action: f?.action ?? null,
      memo: f?.memo ?? null,
      created_by: f?.created_by ?? null,
      updated_by: f?.updated_by ?? null,
      updated_at: f?.updated_at ?? null,
    };
  });

  // 화면 정렬: 평가시각 최신순 (최상단 = 가장 최근 = 가장 큰 No.)
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return rows;
}

/** 한 건의 편집 결과를 feedback 목록에 반영(upsert). 작성자/수정자 자동 기록. */
export interface FeedbackEdit {
  satisfaction_id: string;
  status: FeedbackStatus;
  detail_reason: string | null;
  cause_category: string | null;
  action: string | null;
  memo: string | null;
}

export function upsertFeedback(
  existing: Feedback[],
  edit: FeedbackEdit,
  actorEmpNo: string,
  now: string,
): Feedback[] {
  const idx = existing.findIndex(
    (f) => f.satisfaction_id === edit.satisfaction_id,
  );

  if (idx === -1) {
    // 신규: created_by/updated_by 모두 현재 작성자
    const created: Feedback = {
      id: `fb-${edit.satisfaction_id}`,
      satisfaction_id: edit.satisfaction_id,
      status: edit.status,
      detail_reason: edit.detail_reason,
      cause_category: edit.cause_category,
      action: edit.action,
      memo: edit.memo,
      created_by: actorEmpNo,
      updated_by: actorEmpNo,
      created_at: now,
      updated_at: now,
    };
    return [...existing, created];
  }

  // 갱신: created_by 유지, updated_by/updated_at 만 갱신
  const prev = existing[idx];
  const updated: Feedback = {
    ...prev,
    status: edit.status,
    detail_reason: edit.detail_reason,
    cause_category: edit.cause_category,
    action: edit.action,
    memo: edit.memo,
    updated_by: actorEmpNo,
    updated_at: now,
  };
  const next = existing.slice();
  next[idx] = updated;
  return next;
}
