import type { Satisfaction } from "@/lib/types";
import { reasonLabel } from "@/lib/reasons";

/**
 * 대시보드 통계 계산 (FR-2). 순수 함수로 분리해 추후 Supabase 집계로 교체 가능.
 */

export type Granularity = "day" | "week" | "month";

/** YYYY-MM-DD 만 추출 */
function datePart(iso: string): string {
  return iso.slice(0, 10);
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
  const map = new Map<string, number>();
  for (const r of records) {
    if (r.rating !== "down") continue;
    const code = r.reason ?? "(미지정)";
    map.set(code, (map.get(code) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([reason, count]) => ({
      reason,
      label: reason === "(미지정)" ? "(미지정)" : reasonLabel(reason),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}
