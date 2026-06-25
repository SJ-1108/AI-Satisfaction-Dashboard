/**
 * 날짜/시각 표시 유틸 (KST 고정).
 *
 * created_at 은 ISO 문자열로 저장된다. 특히 DB(Postgres timestamptz)는 값을
 * UTC 로 정규화해 반환하므로, 화면 표시는 항상 한국시간(+09:00)으로 환산한다.
 * (브라우저 로컬 타임존에 의존하지 않도록 UTC 오프셋을 직접 더해 계산한다.)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 문자열을 KST 기준 "YYYY-MM-DD HH:MM:SS" 로 표시한다. */
export function formatKstDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ` +
    `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`
  );
}

/**
 * 기간 필터 역전 여부: 시작일이 종료일보다 미래면 true.
 * (둘 다 채워진 경우에만 판정. "YYYY-MM-DD" 문자열 비교 — 동일 날짜는 정상)
 * records·dashboard 기간 필터 검증에 공통 사용한다.
 */
export function isDateRangeInvalid(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return Boolean(from && to && from > to);
}

/**
 * ISO 문자열을 KST 기준 날짜부분("YYYY-MM-DD")으로 변환한다.
 * DB(timestamptz)는 UTC 로 round-trip 되므로, 날짜 필터·버킷은 반드시
 * 이 함수로 KST 날짜를 구해야 한다. (단순 slice(0,10) 은 UTC 날짜라 하루 어긋남)
 */
export function kstDatePart(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}
