import * as XLSX from "xlsx";
import type { ParsedSatisfaction, Rating } from "@/lib/types";
import { makeRecordKey } from "@/lib/ingest/record-key";
import { cleanText } from "@/lib/ingest/clean-text";

/**
 * 수동 업로드 파싱·자동매핑·검증 (FR-1.2).
 * 브라우저(클라이언트 컴포넌트)에서 호출한다.
 *
 * search_event_id(개인정보)는 업로드 파일에 없다고 가정한다.
 * 필수 컬럼: query, summary_text, rating, created_at
 * 권장 컬럼: reason, comment (없으면 null)
 * 검증을 통과한 행은 record_key 를 부여해 반환한다 (적재 시 중복 판별 기준).
 */

/** 각 DB 컬럼에 매칭될 수 있는 헤더 별칭 (소문자 비교) */
const FIELD_ALIASES: Record<keyof RawFields, string[]> = {
  query: ["query", "검색어", "질의"],
  summary_text: ["summary_text", "summary", "요약", "ai요약", "응답"],
  rating: ["rating", "평가", "평가값"],
  reason: ["reason", "사유", "사유코드"],
  comment: ["comment", "의견", "코멘트"],
  created_at: ["created_at", "createdat", "평가시각", "생성시각", "일시", "날짜"],
};

interface RawFields {
  query: string;
  summary_text: string;
  rating: string;
  reason: string;
  comment: string;
  created_at: string;
}

/** 필수 컬럼 (헤더가 없으면 업로드 차단) */
const REQUIRED_FIELDS: (keyof RawFields)[] = [
  "query",
  "summary_text",
  "rating",
  "created_at",
];

export interface RowError {
  row: number; // 1-base (헤더 제외한 데이터 행 번호)
  message: string;
}

export interface ParseResult {
  /** 검증을 통과한 정상 행 (record_key 포함) */
  valid: ParsedSatisfaction[];
  /** 행별 오류 */
  errors: RowError[];
  /** 컬럼 자동 매핑 결과 (DB컬럼 → 원본헤더). 매칭 실패 시 null */
  mapping: Record<keyof RawFields, string | null>;
  /** 매칭되지 않은 필수 컬럼 (있으면 업로드 차단) */
  requiredMissing: (keyof RawFields)[];
  /** 원본 총 데이터 행 수 */
  totalRows: number;
  /** 파일 내부에서 record_key 가 겹친(중복) 행 수 */
  duplicateInFile: number;
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

/** rating 정규화: up/down (👍/👎, 만족/불만족 등 허용) */
function normalizeRating(value: string): Rating | null {
  const v = value.trim().toLowerCase();
  if (["up", "👍", "good", "1", "true", "만족"].includes(v)) return "up";
  if (["down", "👎", "bad", "0", "false", "불만족"].includes(v)) return "down";
  return null;
}

/**
 * Excel serial date → ISO 문자열.
 * 엑셀의 날짜/시간 숫자값(예: 46198.0549)을 KST 벽시계로 해석한 뒤
 * 실제 UTC instant 로 환산해 일관된 ISO 문자열로 만든다.
 * (25569 = 1970-01-01 의 Excel serial. serial 을 UTC 벽시계로 본 instant 에서
 *  KST(+09:00) 해석을 위해 9시간을 뺀다.)
 */
function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const wallMs = Math.round((serial - 25569) * 86400 * 1000);
  const utcMs = wallMs - 9 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * created_at 정규화: 다양한 입력을 일관된 ISO 문자열로 변환한다.
 * - 문자열 날짜(2026-06-25, 2026-06-25 10:30:00, ...T...+09:00) → Date.parse
 * - Date 객체 → toISOString
 * - 숫자(Excel serial date) → KST 벽시계로 해석해 변환
 * - 숫자 문자열("46198.0549") → Excel serial 로 간주
 */
function normalizeDate(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number") {
    return excelSerialToISO(value);
  }

  const v = String(value).trim();
  if (!v) return null;

  // 숫자만으로 이루어진 문자열 → Excel serial date 로 간주
  if (/^\d+(\.\d+)?$/.test(v)) {
    return excelSerialToISO(Number(v));
  }

  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/**
 * 행 객체 배열을 매핑·검증한다.
 * - 필수 컬럼(헤더) 누락 시 requiredMissing 에 담아 업로드 차단 신호를 준다.
 * - 행 검증: rating(up/down), created_at(파싱 가능). 통과 시 record_key 부여.
 * - query/summary_text 값이 비어 있어도 행은 유지하되 null 로 저장한다.
 */
export function mapAndValidate(rows: Record<string, unknown>[]): ParseResult {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapping = buildMapping(headers);
  const requiredMissing = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  const valid: ParsedSatisfaction[] = [];
  const errors: RowError[] = [];

  const get = (row: Record<string, unknown>, field: keyof RawFields): string => {
    const header = mapping[field];
    if (!header) return "";
    const raw = row[header];
    return raw == null ? "" : String(raw);
  };

  // created_at 은 숫자(Excel serial)/Date 형식을 살려야 하므로 원본 값 그대로 읽는다.
  const getRaw = (row: Record<string, unknown>, field: keyof RawFields): unknown => {
    const header = mapping[field];
    if (!header) return undefined;
    return row[header];
  };

  // 필수 컬럼이 없으면 행 검증을 진행하지 않는다 (업로드 차단 신호만 반환).
  if (requiredMissing.length > 0) {
    return {
      valid: [],
      errors: [],
      mapping,
      requiredMissing,
      totalRows: rows.length,
      duplicateInFile: 0,
    };
  }

  const seenKeys = new Set<string>();
  let duplicateInFile = 0;

  rows.forEach((row, i) => {
    const rowNum = i + 1;
    const ratingRaw = get(row, "rating");
    const createdRaw = getRaw(row, "created_at");

    const rowErrors: string[] = [];
    const rating = normalizeRating(ratingRaw);
    if (!rating) rowErrors.push(`rating 값 오류('${ratingRaw}') — up/down 필요`);

    const created_at = normalizeDate(createdRaw);
    if (!created_at)
      rowErrors.push("created_at 파싱 불가 — 문자열 날짜 또는 엑셀 날짜값만 지원");

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join(", ") });
      return;
    }

    const record: ParsedSatisfaction = {
      // 텍스트 필드는 전처리(+→공백, 태그/엔티티/마커 제거)
      query: cleanText(get(row, "query")) || null,
      summary_text: cleanText(get(row, "summary_text")) || null,
      rating: rating!,
      reason: get(row, "reason").trim() || null, // 코드값 — 정제 제외
      comment: cleanText(get(row, "comment")) || null,
      created_at: created_at!,
      record_key: "",
    };
    record.record_key = makeRecordKey(record);

    if (seenKeys.has(record.record_key)) duplicateInFile++;
    seenKeys.add(record.record_key);

    valid.push(record);
  });

  return {
    valid,
    errors,
    mapping,
    requiredMissing,
    totalRows: rows.length,
    duplicateInFile,
  };
}
