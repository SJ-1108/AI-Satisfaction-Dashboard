import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="ko">
      <head>
        {/* Pretendard (가변폰트, 동적 서브셋) — 한글 UI 가독성 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
