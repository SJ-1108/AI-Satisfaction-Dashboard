"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import type { ParsedSatisfaction, UploadSummary } from "@/lib/types";

/**
 * 엑셀 업로드 누적 적재 (DB 모드, FR-1.2 / FR-1.3).
 *
 * - record_key 기준 upsert: 신규는 insert(record_no 트리거 자동 부여),
 *   기존은 update(id/record_no 유지) → 누적 저장, 중복 방지.
 * - 기존 데이터는 삭제하지 않는다.
 * - satisfaction/upload_batches 쓰기는 RLS 우회가 필요하므로 service-role 사용.
 *
 * 입력 valid 는 이미 검증을 통과한 행(record_key 포함). meta 는 파일 통계.
 */
export async function uploadSatisfaction(
  valid: ParsedSatisfaction[],
  meta: { fileName: string; totalRows: number; failedCount: number },
): Promise<{ ok: boolean; summary?: UploadSummary; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase 미설정 상태입니다." };
  }

  // 업로더 사번 (감사 로그용)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };

  let uploadedBy = emailToEmpNo(user.email ?? "");
  const { data: prof } = await supabase
    .from("profiles")
    .select("emp_no")
    .eq("id", user.id)
    .single();
  if (prof?.emp_no) uploadedBy = prof.emp_no;

  const admin = createAdminClient();

  // 1) 파일 내 중복 제거 (마지막 값 우선)
  const uniqueByKey = new Map<string, ParsedSatisfaction>();
  for (const r of valid) uniqueByKey.set(r.record_key, r);
  const unique = Array.from(uniqueByKey.values());
  const duplicateCount = valid.length - unique.length;

  // 2) 기존 record_key 조회 → insert/update 분류 카운트
  const keys = unique.map((r) => r.record_key);
  let existingKeys = new Set<string>();
  if (keys.length > 0) {
    const { data: existing, error: exErr } = await admin
      .from("satisfaction")
      .select("record_key")
      .in("record_key", keys);
    if (exErr) {
      return { ok: false, error: `기존 데이터 조회 실패: ${exErr.message}` };
    }
    existingKeys = new Set((existing ?? []).map((e) => e.record_key as string));
  }
  const insertedCount = unique.filter((r) => !existingKeys.has(r.record_key)).length;
  const updatedCount = unique.length - insertedCount;

  // 3) 업로드 배치 생성 (processing)
  const { data: batch, error: batchErr } = await admin
    .from("upload_batches")
    .insert({
      file_name: meta.fileName,
      uploaded_by: uploadedBy,
      row_count: meta.totalRows,
      failed_count: meta.failedCount,
      duplicate_count: duplicateCount,
      status: "processing",
    })
    .select("id, uploaded_at")
    .single();
  if (batchErr || !batch) {
    return { ok: false, error: `업로드 이력 생성 실패: ${batchErr?.message}` };
  }

  // 4) upsert (record_key 충돌 시 내용/배치만 갱신, id/record_no 유지)
  const rows = unique.map((r) => ({
    record_key: r.record_key,
    query: r.query,
    summary_text: r.summary_text,
    rating: r.rating,
    reason: r.reason,
    comment: r.comment,
    created_at: r.created_at,
    upload_batch_id: batch.id,
  }));

  const { error: upErr } = await admin
    .from("satisfaction")
    .upsert(rows, { onConflict: "record_key" });

  if (upErr) {
    await admin
      .from("upload_batches")
      .update({ status: "failed", error_message: upErr.message })
      .eq("id", batch.id);
    return { ok: false, error: `적재 실패: ${upErr.message}` };
  }

  // 5) 배치 완료 카운트 업데이트
  await admin
    .from("upload_batches")
    .update({
      inserted_count: insertedCount,
      updated_count: updatedCount,
      status: "completed",
    })
    .eq("id", batch.id);

  return {
    ok: true,
    summary: {
      file_name: meta.fileName,
      uploaded_at: (batch.uploaded_at as string) ?? new Date().toISOString(),
      row_count: meta.totalRows,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      failed_count: meta.failedCount,
      duplicate_count: duplicateCount,
    },
  };
}
