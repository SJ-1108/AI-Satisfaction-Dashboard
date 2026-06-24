import LoginForm from "./login-form";

/**
 * 로그인 화면 (FR-0.1).
 * 사용자는 "사번 + 비밀번호"만 입력한다. 이메일은 노출하지 않는다.
 * (인증 상태 분기/리다이렉트는 middleware가 처리한다.)
 */
export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>만족도 평가 대시보드</h1>
        <p className="sub">사번과 비밀번호로 로그인하세요.</p>
        <LoginForm />
      </div>
    </div>
  );
}
