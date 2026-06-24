import * as XLSX from "xlsx";
import type { Rating, Satisfaction } from "@/lib/types";

/**
 * 수동 업로드 파싱·자동매핑·검증·멱등 upsert (FR-1.2 / FR-1.3).
 * 브라우저(클라이언트 컴포넌트)에서 호출한다.
 */

/** 각 DB 컬럼에 매칭될 수 있는 헤더 별칭 (소문자 비교) */
const FIELD_ALIASES: Record<keyof RawFields, string[]> = {
  search_event_id: ["search_event_id", "event_id", "id", "검색이벤트id", "이벤트id"],
  query: ["query", "검색어", "질의"],
  summary_text: ["summary_text", "summary", "요약", "ai요약", "응답"],
  rating: ["rating", "평가", "평가값"],
  reason: ["reason", "사유", "사유코드"],
  comment: ["comment", "의견", "코멘트"],
  created_at: ["created_at", "createdat", "평가시각", "생성시각", "일시"],
};

interface RawFields {
  search_event_id: string;
  query: string;
  summary_text: string;
  rating: string;
  reason: string;
  comment: string;
  created_at: string;
}

export interface RowError {
  row: number; // 1-base (헤더 제외한 데이터 행 번호)
  message: string;
}

export interface ParseResult {
  /** 검증을 통과한 정상 행 */
  valid: Satisfaction[];
  /** 행별 오류 */
  errors: RowError[];
  /** 컬럼 자동 매핑 결과 (DB컬럼 → 원본헤더). 매칭 실패 시 null */
  mapping: Record<keyof RawFields, string | null>;
  /** 원본 총 데이터 행 수 */
  totalRows: number;
}

/** 파일(File)을 행 객체 배열로 읽는다 (CSV/XLSX 공통, SheetJS). */
export async function readFileRows(
  file: File,
): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/** 원본 헤더들에서 각 DB 컬럼에 대응하는 헤더를 찾는다. */
function buildMapping(
  headers: string[],
): Record<keyof RawFields, string | null> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const normalizedHeaders = headers.map((h) => ({ raw: h, key: norm(h) }));

  const mapping = {} as Record<keyof RawFields, string | null>;
  (Object.keys(FIELD_ALIASES) as (keyof RawFields)[]).forEach((field) => {
    const aliases = FIELD_ALIASES[field].map(norm);
    const hit = normalizedHeaders.find((h) => aliases.includes(h.key));
    mapping[field] = hit ? hit.raw : null;
  });
  return mapping;
}

/** rating 정규화: up/down (👍/👎, 상/하 등 허용) */
function normalizeRating(value: string): Rating | null {
  const v = value.trim().toLowerCase();
  if (["up", "👍", "good", "1", "true", "만족"].includes(v)) return "up";
  if (["down", "👎", "bad", "0", "false", "불만족"].includes(v)) return "down";
  return null;
}

/** created_at 정규화: 파싱 가능하면 ISO 문자열로 */
function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/**
 * 행 객체 배열을 매핑·검증한다.
 * 필수: search_event_id, rating(up/down), created_at(파싱 가능)
 */
export function mapAndValidate(rows: Record<string, unknown>[]): ParseResult {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapping = buildMapping(headers);

  const valid: Satisfaction[] = [];
  const errors: RowError[] = [];

  const get = (row: Record<string, unknown>, field: keyof RawFields): string => {
    const header = mapping[field];
    if (!header) return "";
    const raw = row[header];
    return raw == null ? "" : String(raw);
  };

  rows.forEach((row, i) => {
    const rowNum = i + 1;
    const id = get(row, "search_event_id").trim();
    const ratingRaw = get(row, "rating");
    const createdRaw = get(row, "created_at");

    const rowErrors: string[] = [];
    if (!id) rowErrors.push("search_event_id 누락");

    const rating = normalizeRating(ratingRaw);
    if (!rating) rowErrors.push(`rating 값 오류('${ratingRaw}') — up/down 필요`);

    const created_at = normalizeDate(createdRaw);
    if (!created_at) rowErrors.push(`created_at 파싱 불가('${createdRaw}')`);

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join(", ") });
      return;
    }

    valid.push({
      search_event_id: id,
      query: get(row, "query").trim() || null,
      summary_text: get(row, "summary_text").trim() || null,
      rating: rating!,
      reason: get(row, "reason").trim() || null,
      comment: get(row, "comment").trim() || null,
      created_at: created_at!,
      synced_at: null, // 수동 업로드분은 동기화 시각 없음(실연동 시 서버가 채움)
    });
  });

  return { valid, errors, mapping, totalRows: rows.length };
}

export interface UpsertResult {
  merged: Satisfaction[];
  inserted: number;
  updated: number;
}

/**
 * search_event_id 기준 멱등 upsert (FR-1.3).
 * 같은 ID는 갱신, 신규는 삽입. 입력 내 중복 ID는 마지막 값이 우선.
 */
export function upsertSatisfaction(
  existing: Satisfaction[],
  incoming: Satisfaction[],
): UpsertResult {
  const map = new Map<string, Satisfaction>();
  existing.forEach((r) => map.set(r.search_event_id, r));

  let inserted = 0;
  let updated = 0;
  const seenIncoming = new Set<string>();

  incoming.forEach((r) => {
    const exists = map.has(r.search_event_id);
    // 동일 배치 내 중복은 이중 카운트하지 않음
    if (!seenIncoming.has(r.search_event_id)) {
      if (exists) updated++;
      else inserted++;
      seenIncoming.add(r.search_event_id);
    }
    map.set(r.search_event_id, r);
  });

  return { merged: Array.from(map.values()), inserted, updated };
}
