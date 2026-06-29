/**
 * 업로드 텍스트 전처리 (FR-1.2 전처리).
 *
 * Metabase 원본 export 는 띄어쓰기를 `+` 로 대체하고, HTML 태그·엔티티·마커가 섞여 들어온다.
 * 텍스트 필드(검색어·AI답변·의견)를 사람이 읽기 좋은 형태로 정제한다.
 * 순수 함수 — 파싱(미리보기)·record_key·저장에 동일하게 사용된다.
 */

/** 자주 쓰는 HTML 이름 엔티티 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "-",
  mdash: "-",
};

/** HTML 엔티티 복원 (이름·10진·16진) */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name: string) => {
      const key = name.toLowerCase();
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : m;
    });
}

/**
 * 텍스트 정제:
 * 1) HTML 엔티티 복원 → 2) HTML 태그 제거 → 3) [..]/{{..}} 마커 제거
 * → 4) '+' → 공백 → 5) '#' 마커 제거 → 6) 연속 공백 정리·trim
 */
export function cleanText(input: string | null | undefined): string {
  if (input == null) return "";
  let s = String(input);
  s = decodeEntities(s); // 1) 엔티티 복원 (인코딩된 태그 <…> 도 살려 2)에서 제거)
  s = s.replace(/<[^>]*>/g, " "); // 2) HTML 태그 제거
  s = s.replace(/\{\{[^}]*\}\}/g, " "); // 3) {{...}} 마커
  s = s.replace(/\[[^\]]*\]/g, " "); // 3) [...] 마커
  s = s.replace(/\+/g, " "); // 4) + → 공백
  s = s.replace(/[#*]/g, " "); // 5) #, * 마커 제거(마크다운 **굵게**·* 리스트 등, 내용 보존)
  s = s.replace(/[\\"]/g, ""); // 6) 역슬래시·이중따옴표 제거
  s = s.replace(/\s+/g, " ").trim(); // 7) 공백 정리
  return s;
}
