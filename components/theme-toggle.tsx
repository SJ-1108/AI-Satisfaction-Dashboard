"use client";

import { useTheme } from "@/components/theme-provider";

/** 사이드바 하단 테마 전환 버튼. 현재 테마의 반대로 바꾼다. */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={dark}
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="theme-toggle"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {dark ? (
          // 해
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          // 달
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        )}
      </span>
      <span>{dark ? "라이트 모드" : "다크 모드"}</span>
    </button>
  );
}
