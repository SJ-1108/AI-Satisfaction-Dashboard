import type { Rating, Satisfaction } from "@/lib/types";

/**
 * 원본 조회용 검색/필터/정렬/페이징 (FR-3.2).
 * 순수 함수로 분리해, 추후 Supabase 서버사이드 쿼리로 교체해도
 * 동일한 파라미터 형태를 재사용할 수 있게 한다.
 */

export type SortKey = "created_at" | "rating" | "record_no";
export type SortDir = "asc" | "desc";

export interface QueryParams {
  search?: string; // query/comment/summary/id 부분일치
  rating?: Rating | "all";
  reason?: string | "all";
  dateFrom?: string; // "YYYY-MM-DD" (created_at 기준)
  dateTo?: string; // "YYYY-MM-DD"
  sortKey?: SortKey;
  sortDir?: SortDir;
  page?: number; // 1-base
  pageSize?: number;
}

export interface QueryResult {
  rows: Satisfaction[];
  total: number; // 필터 적용 후 전체 건수
  totalPages: number;
  page: number;
}

const DEFAULTS: Required<
  Pick<QueryParams, "sortKey" | "sortDir" | "page" | "pageSize">
> = {
  sortKey: "created_at",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
};

/** created_at(ISO)에서 날짜 부분(YYYY-MM-DD)만 추출 */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

export function querySatisfaction(
  records: Satisfaction[],
  params: QueryParams = {},
): QueryResult {
  const sortKey = params.sortKey ?? DEFAULTS.sortKey;
  const sortDir = params.sortDir ?? DEFAULTS.sortDir;
  const page = Math.max(1, params.page ?? DEFAULTS.page);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULTS.pageSize);
  const search = params.search?.trim().toLowerCase() ?? "";

  // 1) 필터
  let filtered = records.filter((r) => {
    if (params.rating && params.rating !== "all" && r.rating !== params.rating) {
      return false;
    }
    if (params.reason && params.reason !== "all" && r.reason !== params.reason) {
      return false;
    }
    if (params.dateFrom && datePart(r.created_at) < params.dateFrom) {
      return false;
    }
    if (params.dateTo && datePart(r.created_at) > params.dateTo) {
      return false;
    }
    if (search) {
      const haystack = [
        String(r.record_no),
        r.query,
        r.summary_text,
        r.comment,
        r.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  // 2) 정렬 (record_no 는 숫자 비교, 그 외는 문자열 비교)
  filtered = filtered.slice().sort((a, b) => {
    let cmp: number;
    if (sortKey === "record_no") {
      cmp = (a.record_no ?? 0) - (b.record_no ?? 0);
    } else {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      cmp = String(av).localeCompare(String(bv));
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // 3) 페이징
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  return { rows, total, totalPages, page: safePage };
}

/** 필터 드롭다운용: 데이터에 존재하는 reason 코드 목록 (정렬, null 제외) */
export function distinctReasons(records: Satisfaction[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.reason) set.add(r.reason);
  }
  return Array.from(set).sort();
}
