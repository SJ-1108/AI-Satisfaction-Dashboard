"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/records", label: "데이터 조회" },
  { href: "/feedback", label: "불만족 평가 관리" },
];

/** 좌측 네비게이션 (현재 경로 active 표시). */
export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav>
      {MENU.map((m) => {
        const active = pathname === m.href || pathname.startsWith(m.href + "/");
        return (
          <Link
            key={m.href}
            href={m.href}
            className={`nav-link${active ? " active" : ""}`}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
