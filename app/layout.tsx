import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AI 답변 만족도 평가",
  description: "AI 답변 만족도 평가 대시보드 (Satisfaction Feedback Dashboard)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme 은 아래 인라인 스크립트가 하이드레이션 전에 세팅한다 → 서버 마크업과
    // 달라지므로 html 요소의 속성 불일치 경고만 억제한다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 테마 초기화 — 첫 페인트 전에 저장값/OS 설정으로 data-theme 세팅(깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Pretendard (가변폰트, 동적 서브셋) — 한글 UI 가독성 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
