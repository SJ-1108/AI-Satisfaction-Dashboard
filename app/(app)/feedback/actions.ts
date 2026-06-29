"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { upsertDummyFeedback } from "@/lib/data/dummy-store";
import type { FeedbackEdit } from "@/lib/data/feedback-view";

/**
 * 불만족 피드백 저장 (DB 모드, FR-4.2/4.3).
 * satisfaction_id 기준 1:1 upsert. 작성자/수정자 자동 기록(auth.uid()).
 * RLS 정책(created_by/updated_by = auth.uid())을 만족시키기 위해 사용자 세션으로 쓴다.
 */
export async function saveFeedback(
  edit: FeedbackEdit,
): Promise<{ ok: boolean; error?: string }> {
  // 더미(미리보기) 모드: 서버 인메모리 저장소에 저장 (메뉴 이동·새로고침에도 유지)
  if (!isSupabaseConfigured()) {
    upsertDummyFeedback(edit);
    return { ok: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };

  const fields = {
    status: edit.status,
    detail_reason: edit.detail_reason,
    cause_category: edit.cause_category,
    action: edit.action,
    memo: edit.memo,
  };

  // 기존 피드백 여부 확인 (satisfaction_id 1:1)
  const { data: existing } = await supabase
    .from("feedback")
    .select("id")
    .eq("satisfaction_id", edit.satisfaction_id)
    .maybeSingle();

  if (existing) {
    // 갱신: updated_by = 본인 (created_by 유지)
    const { error } = await supabase
      .from("feedback")
      .update({ ...fields, updated_by: user.id })
      .eq("satisfaction_id", edit.satisfaction_id);
    if (error) return { ok: false, error: error.message };
  } else {
    // 신규: created_by/updated_by = 본인
    const { error } = await supabase.from("feedback").insert({
      satisfaction_id: edit.satisfaction_id,
      ...fields,
      created_by: user.id,
      updated_by: user.id,
    });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
