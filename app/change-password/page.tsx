import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import ChangePasswordForm from "./change-password-form";

/**
 * 비밀번호 변경 화면 (FR-0.2).
 * (app) 레이아웃 밖에 두어 must_change_password 게이트의 리다이렉트 루프를 피한다.
 * 인증은 필요하므로 미인증 접근은 /login 으로 보낸다.
 */
export default async function ChangePasswordPage() {
  // 더미 모드: 비밀번호 개념이 없으므로 대시보드로
  if (!isSupabaseConfigured()) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("emp_no")
    .eq("id", user.id)
    .single();

  const empNo = profile?.emp_no ?? emailToEmpNo(user.email ?? "");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>비밀번호 변경</h1>
        <p className="sub">
          최초 로그인입니다. 계속하려면 새 비밀번호를 설정하세요.
        </p>
        <ChangePasswordForm empNo={empNo} />
      </div>
    </div>
  );
}
