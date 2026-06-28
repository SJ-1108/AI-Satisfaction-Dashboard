import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import Sidebar from "@/components/sidebar";
import SignOutButton from "@/components/sign-out-button";

/**
 * 인증된 영역의 공통 셸 (메뉴 ①②③).
 * 서버에서 사용자/프로필을 조회해 사번·이름을 표시한다 (이메일 비노출).
 * 미인증 접근은 middleware가 1차 차단하지만, 여기서도 방어적으로 확인한다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const configured = isSupabaseConfigured();

  let empNo = "dummy";
  let name = "더미 모드";

  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    // 화면 표시는 사번/이름 기준 (profiles). 조회 실패 시 이메일에서 사번만 추출해 폴백.
    const { data: profile } = await supabase
      .from("profiles")
      .select("emp_no, name, must_change_password")
      .eq("id", user.id)
      .single();

    // 최초 로그인(비밀번호 변경 전)이면 대시보드 접근 차단 → 변경 화면으로 (FR-0.2).
    if (profile?.must_change_password) {
      redirect("/change-password");
    }

    empNo = profile?.emp_no ?? emailToEmpNo(user.email ?? "");
    name = profile?.name ?? "";
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AI 답변 만족도 평가</div>
        <Sidebar />
        <div className="spacer" />
        <div className="user-box">
          <div>
            {name ? `${name} ` : ""}
            <strong>{empNo}</strong>
          </div>
          {configured && (
            <div style={{ marginTop: 8 }}>
              <SignOutButton />
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {!configured && (
          <div className="dev-banner">
            미리보기 모드입니다 — 지금 보이는 내용은 실제 데이터가 아닌 예시
            데이터예요. 새로 입력하거나 업로드한 내용은 새로고침하면 사라집니다.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
