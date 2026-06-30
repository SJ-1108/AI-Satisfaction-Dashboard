import "server-only";
import { DUMMY_SATISFACTION } from "@/lib/data/dummy-satisfaction";
import { DUMMY_FEEDBACK } from "@/lib/data/dummy-feedback";
import { accumulateSatisfaction } from "@/lib/data/accumulate-satisfaction";
import { upsertFeedback, type FeedbackEdit } from "@/lib/data/feedback-view";
import type {
  Feedback,
  ParsedSatisfaction,
  ResetLog,
  Satisfaction,
  UploadBatch,
  UploadSummary,
} from "@/lib/types";

/**
 * 더미(미리보기) 모드 전용 인메모리 누적 저장소 (서버 전용).
 *
 * Supabase 미설정 시, 모든 메뉴(대시보드/데이터 조회/불만족 관리)가 이 저장소를 통해
 * 동일한 누적 데이터를 본다. 업로드/피드백 저장은 서버 액션이 이 저장소를 갱신하고,
 * 페이지는 router.refresh() 로 다시 읽으므로 메뉴 이동·새로고침에도 누적이 유지된다.
 * (서버 프로세스가 재시작되면 초기 더미 데이터로 리셋됨 — 실제 DB 아님)
 *
 * dev 의 HMR(모듈 리로드) 후에도 유지되도록 globalThis 에 보관한다.
 */
interface Store {
  satisfaction: Satisfaction[];
  feedback: Feedback[];
  batches: UploadBatch[];
  resetLogs: ResetLog[];
}

const g = globalThis as unknown as { __dummyStore?: Store };

function store(): Store {
  if (!g.__dummyStore) {
    g.__dummyStore = {
      satisfaction: DUMMY_SATISFACTION.map((r) => ({ ...r })),
      feedback: DUMMY_FEEDBACK.map((r) => ({ ...r })),
      batches: [],
      resetLogs: [],
    };
  }
  return g.__dummyStore;
}

export function getDummySatisfaction(): Satisfaction[] {
  return store().satisfaction;
}

export function getDummyFeedback(): Feedback[] {
  return store().feedback;
}

export function getDummyBatches(): UploadBatch[] {
  return store().batches;
}

export function getDummyResetLogs(): ResetLog[] {
  return store().resetLogs;
}

/**
 * 업로드 청크 누적 (배치 기록 없음).
 * 클라이언트가 valid 를 청크로 나눠 호출 → 큰 단일 페이로드 전송이 막히는 문제 회피.
 */
export function appendDummyRows(valid: ParsedSatisfaction[]): {
  inserted: number;
  updated: number;
} {
  const s = store();
  const { merged, inserted, updated } = accumulateSatisfaction(
    s.satisfaction,
    valid,
    null,
  );
  s.satisfaction = merged;
  return { inserted, updated };
}

/** 업로드 1건 이력(batch) 기록 — 청크 누적이 끝난 뒤 1회 호출. */
export function recordDummyBatch(
  meta: { fileName: string; totalRows: number; failedCount: number },
  totals: { inserted: number; updated: number; duplicate: number },
): UploadSummary {
  const s = store();
  const now = new Date().toISOString();
  s.batches = [
    {
      id: crypto.randomUUID(),
      file_name: meta.fileName,
      uploaded_by: "미리보기",
      uploaded_at: now,
      row_count: meta.totalRows,
      inserted_count: totals.inserted,
      updated_count: totals.updated,
      failed_count: meta.failedCount,
      duplicate_count: totals.duplicate,
      status: "completed",
      error_message: null,
    },
    ...s.batches,
  ];

  return {
    file_name: meta.fileName,
    uploaded_at: now,
    row_count: meta.totalRows,
    inserted_count: totals.inserted,
    updated_count: totals.updated,
    failed_count: meta.failedCount,
    duplicate_count: totals.duplicate,
  };
}

/** 피드백 저장 (satisfaction_id 기준 upsert, 순수 함수 재사용) */
export function upsertDummyFeedback(edit: FeedbackEdit): void {
  const s = store();
  s.feedback = upsertFeedback(s.feedback, edit, "미리보기", new Date().toISOString());
}

/**
 * 전체 초기화 — 평가/피드백/업로드 이력을 비운다(빈 상태).
 * 초기화 이력(resetLogs)은 보존하고, 삭제 건수를 기록한 로그를 추가한다.
 */
export function resetDummyStore(): void {
  const s = store();
  const log: ResetLog = {
    id: crypto.randomUUID(),
    reset_by: "미리보기",
    reset_at: new Date().toISOString(),
    satisfaction_count: s.satisfaction.length,
    feedback_count: s.feedback.length,
    batch_count: s.batches.length,
  };
  s.satisfaction = [];
  s.feedback = [];
  s.batches = [];
  s.resetLogs = [log, ...s.resetLogs];
}
