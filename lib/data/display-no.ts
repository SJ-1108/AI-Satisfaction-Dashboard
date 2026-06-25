import type { Satisfaction } from "@/lib/types";

/**
 * 화면 표시용 누적 번호(display No.) 계산.
 *
 * 전체 누적 데이터를 평가시각(created_at) 오름차순으로 정렬해 1..N 을 부여한다.
 * - 가장 과거 평가 = No.1, 가장 최신 평가 = No.N
 * - 업로드 순서/DB record_no 와 무관하게 created_at 기준으로 결정된다.
 * - DB 식별자나 feedback 연결키로 쓰지 않는다(연결은 satisfaction.id 유지).
 * - created_at 동률은 id 로 안정 정렬해 재계산 시에도 동일 번호가 나오게 한다.
 *
 * 반환: satisfaction.id → display No. 매핑
 */
export function computeDisplayNo(records: Satisfaction[]): Map<string, number> {
  const sorted = records.slice().sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  const map = new Map<string, number>();
  sorted.forEach((r, i) => map.set(r.id, i + 1));
  return map;
}
