/**
 * 테마(라이트/다크) 공용 상태.
 *
 * - 화면 색은 globals.css 의 CSS 변수(`:root[data-theme="dark"]`)가 담당한다.
 * - JS 로 색을 계산하는 곳(Chart.js canvas, 상태 pill 틴트 등)은 CSS 변수를 못 쓰므로
 *   여기의 activeTheme 을 읽어 값을 고른다. ThemeProvider 가 mount 후·토글 시 갱신한다.
 * - 서버 렌더와 클라이언트 첫 렌더는 항상 "light" 로 계산해 하이드레이션 불일치를 피하고,
 *   실제 테마는 mount 후 한 번 더 렌더하며 반영한다(CSS 변수는 인라인 스크립트가 먼저
 *   data-theme 을 세팅하므로 페이지 배경·텍스트는 처음부터 다크로 그려진다).
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "satisfaction-dashboard-theme";

let activeTheme: Theme = "light";

export function getActiveTheme(): Theme {
  return activeTheme;
}

export function setActiveTheme(t: Theme): void {
  activeTheme = t;
}

/** <html data-theme> 에 적용된 값을 읽는다(클라이언트 전용). 없으면 light. */
export function readDomTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * 첫 페인트 전에 실행할 인라인 스크립트. 저장값 → 없으면 OS 설정 → light 순.
 * (루트 layout <head> 에 삽입. React 하이드레이션보다 먼저 data-theme 을 세팅해 깜빡임 방지)
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var t=localStorage.getItem(k);if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;
