"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** 로그아웃 버튼 (FR-0.4). 더미 모드면 인증 없이 로그인 화면으로 이동. */
export default function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        height: 38,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        color: "var(--text-3)",
        background: "var(--panel)",
        border: "1px solid var(--border-strong)",
        borderRadius: 9,
        cursor: "pointer",
      }}
    >
      로그아웃
    </button>
  );
}
