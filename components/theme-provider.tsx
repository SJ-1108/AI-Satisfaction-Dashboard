"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  readDomTheme,
  setActiveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";
import { applyChartDefaults } from "@/lib/chart-style";

type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

/**
 * 테마 상태 공급자. 첫 렌더는 light(서버와 동일) → mount 후 <html data-theme> 값을 읽어
 * 반영한다. 토글 시 data-theme·localStorage·JS 색 계산용 activeTheme·Chart.js 기본값을
 * 함께 갱신하고 state 를 바꿔 차트·pill 이 다시 그려지게 한다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = readDomTheme();
    setActiveTheme(t);
    applyChartDefaults();
    setTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* 저장 실패(프라이빗 창 등)해도 화면 전환은 유지 */
      }
      setActiveTheme(next);
      applyChartDefaults();
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
