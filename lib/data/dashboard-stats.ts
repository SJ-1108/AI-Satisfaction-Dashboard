import type { Feedback, FeedbackStatus, Satisfaction } from "@/lib/types";
import { FEEDBACK_STATUSES } from "@/lib/types";
import {
  reasonLabel,
  reasonOrderIndex,
  REASON_UNSET_LABEL,
} from "@/lib/reasons";
import { kstDatePart } from "@/lib/format-date";

/**
 * 대시보드 통계 계산 (FR-2). 순수 함수로 분리해 추후 Supabase 집계로 교체 가능.
 */

export type Granularity = "day" | "week" | "month";

/** KST 기준 날짜(YYYY-MM-DD) 추출 — 기간 필터·버킷 모두 KST 기준으로 통일 */
function datePart(iso: string): string {
  return kstDatePart(iso);
}

/** 기간(시작~종료, YYYY-MM-DD) 필터 — created_at 기준 */
export function filterByDate(
  records: Satisfaction[],
  from?: string,
  to?: string,
): Satisfaction[] {
  return records.filter((r) => {
    const d = datePart(r.created_at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

/** 데이터에 존재하는 날짜 범위 (날짜 필터 min/max 용). 비어있으면 null */
export function dataDateRange(
  records: Satisfaction[],
): { min: string; max: string } | null {
  if (records.length === 0) return null;
  let min = datePart(records[0].created_at);
  let max = min;
  for (const r of records) {
    const d = datePart(r.created_at);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

// ── FR-2.1 KPI ──────────────────────────────────────────────
export interface Kpis {
  total: number;
  up: number;
  down: number;
  /** 만족률(%) = up/(up+down)*100, 분모 0이면 0 */
  rate: number;
}

export function computeKpis(records: Satisfaction[]): Kpis {
  let up = 0;
  let down = 0;
  for (const r of records) {
    if (r.rating === "up") up++;
    else if (r.rating === "down") down++;
  }
  const denom = up + down;
  const rate = denom === 0 ? 0 : Math.round((up / denom) * 1000) / 10;
  return { total: records.length, up, down, rate };
}

// ── FR-2.2 추이 ─────────────────────────────────────────────
export interface TrendBucket {
  label: string; // 버킷 키 (정렬 가능한 문자열)
  up: number;
  down: number;
}

/** 주 시작(월요일, UTC) 날짜 문자열 */
function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0=월
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function bucketKey(iso: string, g: Granularity): string {
  const d = datePart(iso);
  if (g === "day") return d;
  if (g === "month") return d.slice(0, 7); // YYYY-MM
  return weekStart(d); // week
}

export function computeTrend(
  records: Satisfaction[],
  granularity: Granularity,
): TrendBucket[] {
  const map = new Map<string, TrendBucket>();
  for (const r of records) {
    const key = bucketKey(r.created_at, granularity);
    const b = map.get(key) ?? { label: key, up: 0, down: 0 };
    if (r.rating === "up") b.up++;
    else if (r.rating === "down") b.down++;
    map.set(key, b);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

// ── FR-2.3 불만족 사유별 ────────────────────────────────────
export interface ReasonCount {
  reason: string; // 코드 (null 은 "(미지정)")
  label: string; // 한글 라벨
  count: number;
}

/** 불만족(down) 건의 reason별 집계, 내림차순 */
export function computeReasonBreakdown(
  records: Satisfaction[],
): ReasonCount[] {
  const UNSET = "__unset__";
  const map = new Map<string, number>();
  for (const r of records) {
    if (r.rating !== "down") continue;
    const code = r.reason || UNSET;
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reason, count]) => ({
      reason,
      label: reason === UNSET ? REASON_UNSET_LABEL : reasonLabel(reason),
      count,
    }))
    // 화면 공통 사유 순서로 고정 (건수 내림차순 정렬하지 않음). "기타"는 항상 최하단.
    .sort((a, b) => reasonOrderIndex(a.reason) - reasonOrderIndex(b.reason));
}

// ── 일자별 불만족 및 피드백 처리 현황 ───────────────────────────
export interface DailyFeedbackStatusRow {
  date: string; // YYYY-MM-DD (KST)
  total: number; // 해당 일자 전체 평가 건수
  down: number; // 해당 일자 불만족(rating=down) 건수
  downRate: number; // 불만족률(%) = down/total*100
  status: Record<FeedbackStatus, number>; // 불만족 건의 상태별 카운트(없으면 미확인)
  handledRate: number | null; // 처리완료율(%) = 조치완료/down*100, down=0이면 null
}

function emptyStatusCounts(): Record<FeedbackStatus, number> {
  const acc = {} as Record<FeedbackStatus, number>;
  for (const s of FEEDBACK_STATUSES) acc[s] = 0;
  return acc;
}

/**
 * 일자별(KST created_at) 전체 평가·불만족·상태 분포 집계.
 * 상태는 feedback.satisfaction_id 로 조인하며, 피드백이 없는 불만족 건은 "미확인"으로 집계.
 * 날짜 오름차순 정렬. 기간 필터는 호출 측에서 records 를 미리 거른 뒤 전달한다.
 */
export function computeDailyFeedbackStatus(
  records: Satisfaction[],
  feedback: Feedback[],
): DailyFeedbackStatusRow[] {
  const statusById = new Map<string, FeedbackStatus>();
  for (const f of feedback) statusById.set(f.satisfaction_id, f.status);

  const map = new Map<string, DailyFeedbackStatusRow>();
  for (const r of records) {
    const d = datePart(r.created_at);
    let row = map.get(d);
    if (!row) {
      row = {
        date: d,
        total: 0,
        down: 0,
        downRate: 0,
        status: emptyStatusCounts(),
        handledRate: null,
      };
      map.set(d, row);
    }
    row.total++;
    if (r.rating === "down") {
      row.down++;
      const st = statusById.get(r.id) ?? "미확인";
      row.status[st]++;
    }
  }

  for (const row of map.values()) {
    row.downRate =
      row.total === 0 ? 0 : Math.round((row.down / row.total) * 1000) / 10;
    row.handledRate =
      row.down === 0
        ? null
        : Math.round((row.status["조치완료"] / row.down) * 1000) / 10;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
