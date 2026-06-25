"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "./actions";

/**
 * 비밀번호 변경 폼 (FR-0.2).
 * 새 비밀번호/확인 입력 → 서버 액션 호출 → 성공 시 대시보드로 이동.
 */
export default function ChangePasswordForm({ empNo }: { empNo: string }) {
  const router = useRouter();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (pw1.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw1 !== pw2) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (pw1 === empNo) {
      setError("초기 비밀번호(사번)와 다른 비밀번호를 사용하세요.");
      return;
    }

    setLoading(true);
    const res = await changePassword(pw1);
    if (!res.ok) {
      setError(res.error ?? "비밀번호 변경에 실패했습니다.");
      setLoading(false);
      return;
    }

    // 변경 완료 → 대시보드 (서버 컴포넌트가 must_change_password=false 를 다시 확인)
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <p className="error-msg">{error}</p>}

      <div className="field">
        <label htmlFor="pw1">새 비밀번호</label>
        <input
          id="pw1"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="field">
        <label htmlFor="pw2">새 비밀번호 확인</label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          disabled={loading}
        />
      </div>

      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
