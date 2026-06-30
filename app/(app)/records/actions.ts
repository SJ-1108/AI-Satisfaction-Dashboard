"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import { CACHE_TAGS } from "@/lib/data/source";
import {
  appendDummyRows,
  recordDummyBatch,
  resetDummyStore,
} from "@/lib/data/dummy-store";
import type { ParsedSatisfaction, UploadSummary } from "@/lib/types";

/** 대용량 업로드 시 DB 요청을 나누는 청크 크기 (URL 길이·페이로드·타임아웃 한도 회피) */
const DB_CHUNK_SIZE = 500;

/**
 * 업로드 청크 누적 (FR-1.2 / FR-1.3). 클라이언트가 검증 통과 행(valid)을 청크로 나눠 호출한다.
 *
 * 큰 파일을 단일 서버 액션 페이로드로 보내면 전송이 막히므로(요청 본문 한도·타임아웃),
 * 클라이언트가 record_key 기준 중복을 제거한 뒤 청크 단위로 이 액션을 반복 호출한다.
 * 업로드 이력(batch) 기록은 모든 청크 적재가 끝난 뒤 finishUpload 에서 1회만 한다.
 * - record_key 기준 upsert: 신규 insert(record_no 트리거 자동 부여), 기존 update(id/record_no 유지).
 * - satisfaction 쓰기는 RLS 우회가 필요하므로 service-role 사용.
 */
export async function appendSatisfactionRows(
  valid: ParsedSatisfaction[],
): Promise<{ ok: boolean; inserted?: number; updated?: number; error?: string }> {
  // 더미(미리보기) 모드: 서버 인메모리 저장소에 누적
  if (!isSupabaseConfigured()) {
    const { inserted, updated } = appendDummyRows(valid);
    return { ok: true, inserted, updated };
  }

  // 쓰기 권한 확인 (세션)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료되었습니다. 다시 로그인하세요." };

  const admin = createAdminClient();

  // 기존 record_key 조회 → insert/update 분류 (청크 내 키만 대상, .in() 한도 회피로 재분할)
  const keys = valid.map((r) => r.record_key);
  const existingKeys = new Set<string>();
  for (let i = 0; i < keys.length; i += DB_CHUNK_SIZE) {
    const slice = keys.slice(i, i + DB_CHUNK_SIZE);
    const { data: existing, error: exErr } = await admin
      .from("satisfaction")
      .select("record_key")
      .in("record_key", slice);
    if (exErr) {
      return { ok: false, error: `기존 데이터 조회 실패: ${exErr.message}` };
    }
    for (const e of existing ?? []) existingKeys.add(e.record_key as string);
  }
  const inserted = valid.filter((r) => !existingKeys.has(r.record_key)).length;
  const updated = valid.length - inserted;

  // upsert (record_key 충돌 시 내용만 갱신, id/record_no 유지). 이력 연결은 finishUpload 후 별도 불필요.
  const rows = valid.map((r) => ({
    record_key: r.record_key,
    query: r.query,
    summary_text: r.summary_text,
    rating: r.rating,
    reason: r.reason,
    comment: r.comment,
    created_at: r.created_at,
  }));
  for (let i = 0; i < rows.length; i += DB_CHUNK_SIZE) {
    const slice = rows.slice(i, i + DB_CHUNK_SIZE);
    const { error: upErr } = await admin
      .from("satisfaction")
      .upsert(slice, { onConflict: "record_key" });
    if (upErr) {
      return { ok: false, error: `적재 실패: ${upErr.message}` };
    }
  }

  return { ok: true, inserted, updated };
}

/**
 * 업로드 마무리 — 누적 합계로 업로드 이력(batch) 1건 기록 + 캐시 무효화.
 * 클라이언트가 모든 청크를 appendSatisfactionRows 로 적재한 뒤 1회 호출한다.
 */
export async function finishUpload(
  meta: { fileName: string; totalRows: number; failedCount: number },
  totals: { inserted: number; updated: number; duplicate: number },
): Promise<{ ok: boolean; summary?: UploadSummary; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: true, summary: recordDummyBatch(meta, totals) };
  }

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
  const { data: batch, error: batchErr } = await admin
    .from("upload_batches")
    .insert({
      file_name: meta.fileName,
      uploaded_by: uploadedBy,
      row_count: meta.totalRows,
      inserted_count: totals.inserted,
      updated_count: totals.updated,
      failed_count: meta.failedCount,
      duplicate_count: totals.duplicate,
      status: "completed",
    })
    .select("id, uploaded_at")
    .single();
  if (batchErr || !batch) {
    return { ok: false, error: `업로드 이력 생성 실패: ${batchErr?.message}` };
  }

  // 누적 데이터·업로드 이력 캐시 무효화 → 모든 메뉴에 즉시 반영
  revalidateTag(CACHE_TAGS.satisfaction);
  revalidateTag(CACHE_TAGS.batches);

  return {
    ok: true,
    summary: {
      file_name: meta.fileName,
      uploaded_at: (batch.uploaded_at as string) ?? new Date().toISOString(),
      row_count: meta.totalRows,
      inserted_count: totals.inserted,
      updated_count: totals.updated,
      failed_count: meta.failedCount,
      duplicate_count: totals.duplicate,
    },
  };
}

/**
 * 전체 데이터 초기화 (되돌릴 수 없음).
 * - 더미 모드: 인메모리 저장소 비우기 (+ 초기화 이력 기록)
 * - 실제 DB: 삭제 건수 집계 → feedback → satisfaction → upload_batches 순 전체 삭제
 *   (FK 제약 고려) → reset_logs 에 이력 기록. 삭제/기록은 service-role 사용.
 */
export async function resetData(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    resetDummyStore();
    return { ok: true };
  }

  // 초기화한 사람(사번) — 감사 로그용
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let resetBy = user ? emailToEmpNo(user.email ?? "") : null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("emp_no")
      .eq("id", user.id)
      .single();
    if (prof?.emp_no) resetBy = prof.emp_no;
  }

  const admin = createAdminClient();

  // 삭제 전 건수 집계 (이력 기록용, head:true 로 데이터 없이 count 만)
  const [satCount, fbCount, batchCount] = await Promise.all([
    admin.from("satisfaction").select("*", { count: "exact", head: true }),
    admin.from("feedback").select("*", { count: "exact", head: true }),
    admin.from("upload_batches").select("*", { count: "exact", head: true }),
  ]);

  // id IS NOT NULL 조건으로 전체 행 삭제 (Supabase 는 delete 시 필터 요구)
  const fb = await admin.from("feedback").delete().not("id", "is", null);
  if (fb.error) return { ok: false, error: `피드백 삭제 실패: ${fb.error.message}` };

  const sat = await admin.from("satisfaction").delete().not("id", "is", null);
  if (sat.error) return { ok: false, error: `평가 데이터 삭제 실패: ${sat.error.message}` };

  const batch = await admin.from("upload_batches").delete().not("id", "is", null);
  if (batch.error)
    return { ok: false, error: `업로드 이력 삭제 실패: ${batch.error.message}` };

  // 초기화 이력 기록 (reset_logs 는 초기화로 지워지지 않음)
  await admin.from("reset_logs").insert({
    reset_by: resetBy,
    satisfaction_count: satCount.count ?? 0,
    feedback_count: fbCount.count ?? 0,
    batch_count: batchCount.count ?? 0,
  });

  // 전체 초기화 → 모든 데이터 캐시 무효화 (+ 초기화 이력)
  revalidateTag(CACHE_TAGS.satisfaction);
  revalidateTag(CACHE_TAGS.feedback);
  revalidateTag(CACHE_TAGS.batches);
  revalidateTag(CACHE_TAGS.resetLogs);

  return { ok: true };
}
