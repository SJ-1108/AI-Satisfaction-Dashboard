import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "만족도 평가 대시보드",
  description: "통합검색 만족도 평가 대시보드 (Satisfaction Feedback Dashboard)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
