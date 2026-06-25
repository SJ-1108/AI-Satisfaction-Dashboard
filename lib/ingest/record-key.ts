import type { Rating } from "@/lib/types";

/**
 * record_key 생성 (중복 업로드 방지).
 *
 * search_event_id(개인정보)를 제거함에 따라, 개인정보가 아닌 컬럼 조합을
 * 정규화 + 해시하여 행의 고유키를 만든다. 동일 내용이면 항상 같은 키가 나오므로
 * 동일 파일/행을 재업로드해도 중복 행이 생기지 않는다 (insert/update 판별 기준).
 *
 * 조합: created_at | query | summary_text | rating | reason | comment
 * 정규화: 앞뒤 공백 제거, 내부 연속 공백/줄바꿈을 단일 공백으로, null/undefined→""
 *   → 공백·줄바꿈·null 차이로 키가 달라지지 않도록 한다.
 */

/** 키 구성 필드 (해시 입력) */
export interface RecordKeyFields {
  created_at: string;
  query: string | null;
  summary_text: string | null;
  rating: Rating;
  reason: string | null;
  comment: string | null;
}

/** 필드 경계 구분자 (내용에 거의 없는 제어문자) */
const SEP = "␟";

/** 문자열 정규화: 양끝 trim + 내부 공백/줄바꿈 단일화. null/undefined → "" */
export function normalizeField(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

/** cyrb53 — 빠른 결정적 문자열 해시 (53비트). 충돌 가능성 매우 낮음. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 정규화된 필드 조합으로 record_key(16진 문자열)를 만든다. */
export function makeRecordKey(fields: RecordKeyFields): string {
  const joined = [
    normalizeField(fields.created_at),
    normalizeField(fields.query),
    normalizeField(fields.summary_text),
    normalizeField(fields.rating),
    normalizeField(fields.reason),
    normalizeField(fields.comment),
  ].join(SEP);
  return cyrb53(joined).toString(16).padStart(14, "0");
}
