import type { ParsedSatisfaction, Satisfaction } from "@/lib/types";

/**
 * 더미/세션 모드용 누적 업서트 (순수 함수).
 *
 * record_key 기준으로:
 *   - 신규 key  → insert (record_no = 기존 max + 1 부터 순서대로)
 *   - 기존 key  → update (id/record_no 유지, 내용/배치만 갱신)
 *   - 파일 내 중복 key → 마지막 값만 반영(중복 카운트)
 * 기존 데이터는 삭제하지 않는다(누적). DB 모드는 서버 액션이 동일 규칙으로 처리.
 */

export interface AccumulateResult {
  merged: Satisfaction[];
  inserted: number;
  updated: number;
  duplicate: number;
}

/** UUID 생성기 (브라우저 crypto). 테스트를 위해 주입 가능. */
function defaultIdGen(): string {
  return crypto.randomUUID();
}

export function accumulateSatisfaction(
  existing: Satisfaction[],
  incoming: ParsedSatisfaction[],
  batchId: string | null,
  idGen: () => string = defaultIdGen,
): AccumulateResult {
  // 1) 파일 내 중복 제거 (마지막 값 우선). duplicate = 제거된 행 수.
  const uniqueByKey = new Map<string, ParsedSatisfaction>();
  for (const inc of incoming) uniqueByKey.set(inc.record_key, inc);
  const duplicate = incoming.length - uniqueByKey.size;

  // 2) 기존 record_key → 인덱스 맵, 최대 record_no
  const indexByKey = new Map<string, number>();
  existing.forEach((r, i) => indexByKey.set(r.record_key, i));
  let maxRecordNo = existing.reduce((m, r) => Math.max(m, r.record_no), 0);

  const merged = existing.slice();
  let inserted = 0;
  let updated = 0;

  for (const inc of uniqueByKey.values()) {
    const existIdx = indexByKey.get(inc.record_key);
    if (existIdx !== undefined) {
      // 기존 → update (id/record_no 유지)
      const prev = merged[existIdx];
      merged[existIdx] = {
        ...prev,
        query: inc.query,
        summary_text: inc.summary_text,
        rating: inc.rating,
        reason: inc.reason,
        comment: inc.comment,
        created_at: inc.created_at,
        upload_batch_id: batchId,
      };
      updated++;
    } else {
      // 신규 → insert (record_no = max + 1)
      maxRecordNo += 1;
      merged.push({
        id: idGen(),
        record_no: maxRecordNo,
        record_key: inc.record_key,
        query: inc.query,
        summary_text: inc.summary_text,
        rating: inc.rating,
        reason: inc.reason,
        comment: inc.comment,
        created_at: inc.created_at,
        upload_batch_id: batchId,
        synced_at: null,
      });
      inserted++;
    }
  }

  return { merged, inserted, updated, duplicate };
}
