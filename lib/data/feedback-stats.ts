import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/types";
import type { FeedbackRow } from "@/lib/data/feedback-view";

/**
 * 불만족 관리 통계 (FR-4.4). 순수 함수로 분리해 추후 Supabase 집계로 교체 가능.
 */

/** 상태별 건수 (모든 상태 키를 0으로 초기화해 누락 없이 반환) */
export function countByStatus(
  rows: FeedbackRow[],
): Record<FeedbackStatus, number> {
  const out = {} as Record<FeedbackStatus, number>;
  for (const s of FEEDBACK_STATUSES) out[s] = 0;
  for (const r of rows) out[r.status]++;
  return out;
}

export interface CategoryCount {
  category: string; // 원인분류 (없으면 "미분류")
  count: number;
}

/** 원인분류(cause_category)별 건수, 내림차순. 미입력은 "미분류"로 묶음 */
export function countByCauseCategory(rows: FeedbackRow[]): CategoryCount[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.cause_category?.trim() || "미분류";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/** 처리율(%) = (미확인 외 상태 건수)/전체. 전체 0이면 0 */
export function handledRate(rows: FeedbackRow[]): number {
  if (rows.length === 0) return 0;
  const handled = rows.filter((r) => r.status !== "미확인").length;
  return Math.round((handled / rows.length) * 1000) / 10;
}
