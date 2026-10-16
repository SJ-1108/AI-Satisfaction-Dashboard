/**
 * 업로드 텍스트 전처리 (FR-1.2 전처리).
 *
 * Metabase 원본 export 의 AI 답변(summary_text)은 띄어쓰기가 `+` 로 대체되고, 일부 기호는
 * HTML 엔티티(`&#046;` `&#061;` `&#39;` `&lt;` …)로, 따옴표는 두 번 겹친 형태(`''` `""`)로
 * 들어오며, 마크다운(`\#\#` 제목·`**굵게**`·`*` 목록)과 인용 태그(`<megaml:cite …>`)가 섞여 있다.
 * 표시용 마커만 걷어내고 실제 답변에 쓰인 기호(+ = " [ ] # * 등)와 줄바꿈은 보존한다.
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

export interface CleanTextOptions {
  /**
   * `+` 를 띄어쓰기로 복원할지.
   * - true: 항상 (summary_text — 원본이 띄어쓰기를 `+` 로 대체)
   * - "auto"(기본): 일반 공백이 하나도 없고 `+` 가 있을 때만 (query/comment 는 보통
   *   일반 공백으로 들어오므로 "C++ 강의" 같은 실제 `+` 를 지키기 위함)
   */
  plusAsSpace?: boolean | "auto";
}

/**
 * 텍스트 정제:
 * 1) `+` → 공백 (엔티티 복원 전에 해야 `&#043;` 로 인코딩된 실제 `+` 가 살아남는다)
 * 2) HTML 엔티티 복원 → 3) 겹친 따옴표(`''` `""`) 하나로
 * 4) HTML/인용 태그·{{..}}·숫자 인용 마커([1], [0-1]) 제거
 * 5) 마크다운 이스케이프(`\#`)·제목(`##`)·굵게(`**`) 마커 제거, `*` 목록 → `-`
 * 6) 줄 단위 공백 정리 (줄바꿈은 보존, 빈 줄은 최대 1줄)
 */
export function cleanText(
  input: string | null | undefined,
  { plusAsSpace = "auto" }: CleanTextOptions = {},
): string {
  if (input == null) return "";
  let s = String(input).replace(/\r\n?/g, "\n");

  // 1) + → 공백
  const plusEncoded =
    plusAsSpace === true || (plusAsSpace === "auto" && !s.includes(" ") && s.includes("+"));
  if (plusEncoded) s = s.replace(/\+/g, " ");

  // 2) 엔티티 복원 (인코딩된 태그 &lt;…&gt; 도 살려 4)에서 제거)
  s = decodeEntities(s);

  // 3) 원본에서 두 번 겹쳐 들어온 따옴표를 하나로
  s = s.replace(/''/g, "'").replace(/""/g, '"');

  // 4) 태그·마커 — 태그는 '<' 바로 뒤에 이름이 오는 것만("1 < 2" 같은 부등호는 보존)
  s = s.replace(/<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g, " ");
  s = s.replace(/\{\{[^}]*\}\}/g, " ");
  s = s.replace(/\[\s*\d+(?:\s*[-,]\s*\d+)*\s*\]/g, " "); // [1] [0-1] [0-1,0-2] 만

  // 5) 마크다운
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!>~|"'])/g, "$1"); // \# \* 등 이스케이프 해제
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, ""); // 줄 머리 제목 마커
  s = s.replace(/\*\*(.+?)\*\*/g, "$1"); // **굵게**
  s = s.replace(/^([ \t]*)\*[ \t]+/gm, "$1- "); // * 목록 → -

  // 6) 공백 정리 — 줄 안의 연속 공백 1칸, 줄 앞뒤 trim, 빈 줄 최대 1줄
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}
