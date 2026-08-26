"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { emailToEmpNo } from "@/lib/empno";
import {
  CACHE_TAGS,
  loadSatisfactionByIds,
  loadSatisfactionIndex,
} from "@/lib/data/source";
import { computeDisplayNo } from "@/lib/data/display-no";
import {
  querySatisfaction,
  type QueryParams,
} from "@/lib/data/satisfaction-query";
import type { Satisfaction } from "@/lib/types";
import {
  appendDummyRows,
  recordDummyBatch,
  resetDummyStore,
} from "@/lib/data/dummy-store";
import type {
  ParsedSatisfaction,
  UploadRowLog,
  UploadSummary,
} from "@/lib/types";

/** 대용량 업로드 시 DB 요청을 나누는 청크 크기 (URL 길이·페이로드·타임아웃 한도 회피) */
const DB_CHUNK_SIZE = 500;

/**
 * 데이터 조회 목록 1페이지 (FR-3.2) — 서버에서 검색·필터·정렬·페이징을 끝내고
 * **현재 페이지 행만** 돌려준다.
 *
 * 전체 행을 브라우저로 보내던 기존 구조는 누적이 늘수록 페이로드가 선형으로 커져
 * (행당 summary_text 3KB 안팎) 조회 상한·캐시 한도에 부딪혔다. 이제 서버는
 * 경량 인덱스(행당 ~200B, 캐시됨)로 필터·정렬·순번을 계산하고, 확정된 페이지의
 * id 로만 전체 컬럼을 채운다 → 브라우저 전송량이 페이지 크기에 비례한다.
 *
 * 필터·정렬·순번 계산은 기존 순수 함수(querySatisfaction/computeDisplayNo)를
 * 그대로 재사용하므로 화면 동작이 이전과 동일하다.
 */
export interface RecordsPage {
  /** 현재 페이지 행 (전체 컬럼) */
  rows: Satisfaction[];
  /** 행 id → 화면 표시 No. (전체 데이터 기준, 필터와 무관하게 고정) */
  displayNo: Record<string, number>;
  /** 필터 적용 후 건수 */
  total: number;
  totalPages: number;
  /** 실제로 반환한 페이지 번호 (범위를 벗어나면 보정됨) */
  page: number;
  /** 필터 이전 전체 건수 (조회 누락 진단용) */
  indexCount: number;
}

/**
 * 로그인 확인. 서버 액션은 페이지와 별개로 호출 가능한 엔드포인트이므로,
 * 미들웨어 보호에 더해 여기서도 막는다(이중 방어). 더미 모드는 인증이 없어 통과.
 */
async function assertSession(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("세션이 만료되었습니다. 다시 로그인하세요.");
}

export async function queryRecordsPage(
  params: QueryParams,
): Promise<RecordsPage> {
  await assertSession();
  const index = await loadSatisfactionIndex();
  const displayNoMap = computeDisplayNo(index);
  const result = querySatisfaction(index, params);

  const ids = result.rows.map((r) => r.id);
  const rows = await loadSatisfactionByIds(ids);

  const displayNo: Record<string, number> = {};
  for (const r of rows) {
    const no = displayNoMap.get(r.id);
    if (no !== undefined) displayNo[r.id] = no;
  }

  return {
    rows,
    displayNo,
    total: result.total,
    totalPages: result.totalPages,
    page: result.page,
    indexCount: index.length,
  };
}

/**
 * 내보내기용 — 필터 결과 전체를 페이지 단위로 이어서 받아간다.
 * 한 번에 다 돌려주면 응답 크기 한도(Vercel 4.5MB)에 걸릴 수 있어,
 * 클라이언트가 offset 을 올려가며 여러 번 호출한다.
 */
const EXPORT_CHUNK_SIZE = 500;

export async function exportRecordsChunk(
  params: QueryParams,
  offset: number,
): Promise<{ rows: Satisfaction[]; displayNo: Record<string, number>; total: number }> {
  await assertSession();
  const index = await loadSatisfactionIndex();
  const displayNoMap = computeDisplayNo(index);
  // 필터·정렬만 적용한 전체 결과에서 offset 구간을 잘라낸다.
  const all = querySatisfaction(index, {
    ...params,
    page: 1,
    pageSize: Number.MAX_SAFE_INTEGER,
  });
  const slice = all.rows.slice(offset, offset + EXPORT_CHUNK_SIZE);
  const rows = await loadSatisfactionByIds(slice.map((r) => r.id));

  const displayNo: Record<string, number> = {};
  for (const r of rows) {
    const no = displayNoMap.get(r.id);
    if (no !== undefined) displayNo[r.id] = no;
  }
  return { rows, displayNo, total: all.total };
}

/**
 * appendSatisfactionRows 의 row별 처리 결과 (upload_batch_rows 로그 구성용).
 * 클라이언트가 record_key 로 자신의 원본 행과 조인해 최종 로그를 만든다.
 */
export interface RowActionResult {
  record_key: string;
  action: "insert" | "update";
  /** 적재된 satisfaction.id (신규/갱신 모두) */
  satisfaction_id: string | null;
  /** 갱신 시 기존 값(신규면 null) — before/after 비교용 */
  device_type_before: string | null;
  guardrail_label_before: string | null;
}

/** appendSatisfactionRows 반환 — 신규 insert / 기존 갱신 건수 + row별 결과. */
export interface AppendResult {
  ok: boolean;
  /** 신규 insert 건수 */
  inserted?: number;
  /** record_key 일치로 갱신된 기존 건수 */
  updated?: number;
  /** row별 처리 결과 (record_key 기준). 더미 모드에서는 비어 있을 수 있다. */
  results?: RowActionResult[];
  error?: string;
}

/**
 * 업로드 청크 누적 (FR-1.2 / FR-1.3) — record_key 기준 중복 판단으로 insert/upsert 한다.
 * 클라이언트가 검증 통과 행(valid)을 청크로 나눠 호출한다(단일 페이로드 한도·타임아웃 회피).
 *
 * - record_key(created_at·query·summary_text·rating·reason·comment 정규화 해시) 기준 upsert:
 *   신규 key → insert(record_no 트리거 자동 부여), 기존 key → update(id/record_no 유지).
 * - 컬럼명 alias/정규화는 파싱 단계(mapAndValidate)에서 이미 적용되므로, 컬럼명이 달라도
 *   같은 값이면 동일 record_key 로 중복 인식된다.
 * - device_type/guardrail_label 은 함께 저장되되 record_key(중복 기준)에는 포함되지 않는다.
 * - 업로드 이력(batch) 기록은 모든 청크 적재가 끝난 뒤 finishUpload 에서 1회만 한다.
 * - satisfaction 쓰기는 RLS 우회가 필요하므로 service-role 사용.
 */
export async function appendSatisfactionRows(
  valid: ParsedSatisfaction[],
): Promise<AppendResult> {
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

  // 기존 record_key 조회 → insert/update 분류 (청크 내 키만 대상, .in() 한도 회피로 재분할).
  // 갱신 before/after 확인을 위해 device_type/guardrail_label 도 함께 조회한다
  // (record_key 단독 조회 대비 컬럼 몇 개만 늘 뿐이라 속도 영향은 미미).
  const keys = valid.map((r) => r.record_key);
  const existingByKey = new Map<
    string,
    { id: string; device_type: string | null; guardrail_label: string | null }
  >();
  for (let i = 0; i < keys.length; i += DB_CHUNK_SIZE) {
    const slice = keys.slice(i, i + DB_CHUNK_SIZE);
    const { data: existing, error: exErr } = await admin
      .from("satisfaction")
      .select("id, record_key, device_type, guardrail_label")
      .in("record_key", slice);
    if (exErr) {
      return { ok: false, error: `기존 데이터 조회 실패: ${exErr.message}` };
    }
    for (const e of existing ?? []) {
      existingByKey.set(e.record_key as string, {
        id: e.id as string,
        device_type: (e.device_type as string | null) ?? null,
        guardrail_label: (e.guardrail_label as string | null) ?? null,
      });
    }
  }
  const inserted = valid.filter((r) => !existingByKey.has(r.record_key)).length;
  const updated = valid.length - inserted;

  // upsert (record_key 충돌 시 내용만 갱신, id/record_no 유지).
  // .select 로 record_key→id 를 회수(신규 행의 id 확보 + 갱신 행 id 확인)한다.
  const rows = valid.map((r) => ({
    record_key: r.record_key,
    query: r.query,
    summary_text: r.summary_text,
    rating: r.rating,
    reason: r.reason,
    comment: r.comment,
    device_type: r.device_type,
    guardrail_label: r.guardrail_label,
    created_at: r.created_at,
  }));
  const idByKey = new Map<string, string>();
  for (let i = 0; i < rows.length; i += DB_CHUNK_SIZE) {
    const slice = rows.slice(i, i + DB_CHUNK_SIZE);
    const { data: upserted, error: upErr } = await admin
      .from("satisfaction")
      .upsert(slice, { onConflict: "record_key" })
      .select("id, record_key");
    if (upErr) {
      return { ok: false, error: `적재 실패: ${upErr.message}` };
    }
    for (const u of upserted ?? []) {
      idByKey.set(u.record_key as string, u.id as string);
    }
  }

  // row별 결과 — 클라이언트가 record_key 로 원본 행과 조인해 upload_batch_rows 를 만든다.
  const results: RowActionResult[] = valid.map((r) => {
    const ex = existingByKey.get(r.record_key);
    const isUpdate = ex !== undefined;
    return {
      record_key: r.record_key,
      action: isUpdate ? "update" : "insert",
      satisfaction_id: idByKey.get(r.record_key) ?? ex?.id ?? null,
      device_type_before: isUpdate ? ex!.device_type : null,
      guardrail_label_before: isUpdate ? ex!.guardrail_label : null,
    };
  });

  return { ok: true, inserted, updated, results };
}

/**
 * 업로드 마무리 — 누적 합계로 업로드 이력(batch) 1건 기록 + 캐시 무효화.
 * 클라이언트가 모든 청크를 appendSatisfactionRows 로 적재한 뒤 1회 호출한다.
 */
export async function finishUpload(
  meta: { fileName: string; totalRows: number; failedCount: number },
  totals: { inserted: number; updated: number; duplicate: number },
  rowLogs: UploadRowLog[] = [],
): Promise<{ ok: boolean; summary?: UploadSummary; error?: string }> {
  if (!isSupabaseConfigured()) {
    // 더미(미리보기) 모드는 DB 가 없어 row별 로그를 저장하지 않는다(집계만 기록).
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

  // row별 처리 로그 저장 (upload_batch_rows). 배치 id 를 붙여 청크로 일괄 insert.
  // best-effort: 로그 저장이 실패해도 이미 적재된 satisfaction·배치 이력은 유지하고
  // 업로드 자체는 성공 처리한다(로그 실패로 데이터 적재를 되돌리지 않는다).
  if (rowLogs.length > 0) {
    for (let i = 0; i < rowLogs.length; i += DB_CHUNK_SIZE) {
      const slice = rowLogs
        .slice(i, i + DB_CHUNK_SIZE)
        .map((l) => ({ upload_batch_id: batch.id, ...l }));
      const { error: logErr } = await admin
        .from("upload_batch_rows")
        .insert(slice);
      if (logErr) {
        console.error("upload_batch_rows 로그 저장 실패:", logErr.message);
        break;
      }
    }
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

  // 초기화 이력을 먼저 기록한다(삭제 전 건수 기준, reset_logs 는 초기화로 지워지지 않음).
  // 기록이 실패하면 이력 없이 데이터만 사라지는 것을 막기 위해 삭제하지 않고 중단한다.
  const logIns = await admin.from("reset_logs").insert({
    reset_by: resetBy,
    satisfaction_count: satCount.count ?? 0,
    feedback_count: fbCount.count ?? 0,
    batch_count: batchCount.count ?? 0,
  });
  if (logIns.error) {
    return { ok: false, error: `초기화 이력 기록 실패: ${logIns.error.message}` };
  }

  // id IS NOT NULL 조건으로 전체 행 삭제 (Supabase 는 delete 시 필터 요구)
  const fb = await admin.from("feedback").delete().not("id", "is", null);
  if (fb.error) return { ok: false, error: `피드백 삭제 실패: ${fb.error.message}` };

  const sat = await admin.from("satisfaction").delete().not("id", "is", null);
  if (sat.error) return { ok: false, error: `평가 데이터 삭제 실패: ${sat.error.message}` };

  const batch = await admin.from("upload_batches").delete().not("id", "is", null);
  if (batch.error)
    return { ok: false, error: `업로드 이력 삭제 실패: ${batch.error.message}` };

  // 전체 초기화 → 모든 데이터 캐시 무효화 (+ 초기화 이력)
  revalidateTag(CACHE_TAGS.satisfaction);
  revalidateTag(CACHE_TAGS.feedback);
  revalidateTag(CACHE_TAGS.batches);
  revalidateTag(CACHE_TAGS.resetLogs);

  return { ok: true };
}
