import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import { isDummyMode, loadFeedback, loadSatisfaction } from "@/lib/data/source";
import FeedbackClient from "@/components/feedback/feedback-client";

/**
 * 메뉴 ③ 불만족 관리 (FR-4). 누적 데이터(DB 또는 더미) 기준.
 * 작성자 자동 기록을 위해 서버에서 현재 사용자(사번/이름)를 조회해 전달한다.
 * (이메일은 화면에 노출하지 않고 사번만 사용)
 */
export default async function FeedbackPage() {
  let empNo = "dummy";
  let name = "더미 모드";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("emp_no, name")
        .eq("id", user.id)
        .single();

      empNo = profile?.emp_no ?? emailToEmpNo(user.email ?? "");
      name = profile?.name ?? "";
    }
  }

  const [satisfaction, feedback] = await Promise.all([
    loadSatisfaction(),
    loadFeedback(),
  ]);

  return (
    <FeedbackClient
      currentUser={{ empNo, name }}
      satisfaction={satisfaction}
      initialFeedback={feedback}
      dbMode={!isDummyMode()}
    />
  );
}
