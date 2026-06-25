"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 비밀번호 변경 서버 액션 (FR-0.2).
 * 1) 현재 로그인 사용자 확인
 * 2) Supabase Auth 비밀번호 갱신 (사용자 세션)
 * 3) service-role 로 profiles.must_change_password = false (RLS 우회, 서버 전용)
 *
 * service-role 키는 이 서버 액션 내부에서만 사용하며 프론트로 노출되지 않는다.
 */
export async function changePassword(
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };
  }

  const empNo = (user.user_metadata?.emp_no as string | undefined)?.trim() ?? "";

  // 서버측 재검증 (클라이언트 검증 우회 방지)
  if (newPassword.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (empNo && newPassword === empNo) {
    return {
      ok: false,
      error: "초기 비밀번호(사번)와 다른 비밀번호를 사용하세요.",
    };
  }

  // 2) Auth 비밀번호 갱신
  const { error: updErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updErr) {
    return {
      ok: false,
      error: "비밀번호 변경에 실패했습니다. 다른 비밀번호로 시도하세요.",
    };
  }

  // 3) 변경 강제 플래그 해제 (service-role)
  const admin = createAdminClient();
  const { error: profErr } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (profErr) {
    return {
      ok: false,
      error: "상태 업데이트에 실패했습니다. 잠시 후 다시 시도하세요.",
    };
  }

  return { ok: true };
}
