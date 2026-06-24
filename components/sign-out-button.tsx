"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 로그아웃 버튼 (FR-0.4). */
export default function SignOutButton() {
  const router = useRouter();

  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="btn-ghost" onClick={onClick}>
      로그아웃
    </button>
  );
}
