"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { empNoToEmail } from "@/lib/empno";

/**
 * 사번 로그인 폼.
 * 입력은 사번+비밀번호. 제출 직전에만 사번 → 이메일로 내부 변환하여
 * Supabase Auth 로 로그인한다 (이메일은 화면에 노출하지 않음).
 */
export default function LoginForm() {
  const router = useRouter();
  const [empNo, setEmpNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 사번·비밀번호가 모두 채워질 때만 제출 활성 (디자인 규칙)
  const filled = Boolean(empNo.trim() && password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!filled) {
      setError("사번과 비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);

    // 더미 모드(Supabase 미설정): 인증을 우회하고 바로 대시보드로 이동.
    // (세션 변경이 없으므로 router.refresh() 불필요 — 중복 렌더 방지)
    if (!isSupabaseConfigured()) {
      router.push("/dashboard");
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: empNoToEmail(empNo), // 내부 변환 (비가시)
      password,
    });

    if (signInError) {
      // 보안상 사번/비밀번호 어느 쪽이 틀렸는지 구분하지 않는다.
      setError("사번 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <p className="error-msg">{error}</p>}

      <div className="field">
        <label htmlFor="empNo">사번</label>
        <input
          id="empNo"
          name="empNo"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          placeholder="사번을 입력하세요"
          value={empNo}
          onChange={(e) => setEmpNo(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <div className="pw-wrap">
          <input
            id="password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            className="pw-toggle"
            aria-label="비밀번호 표시 전환"
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? "숨기기" : "표시"}
          </button>
        </div>
      </div>

      <button className="btn-primary" type="submit" disabled={!filled || loading}>
        {loading ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
