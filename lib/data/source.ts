import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getDummyBatches,
  getDummyFeedback,
  getDummySatisfaction,
} from "@/lib/data/dummy-store";
import type { Feedback, Satisfaction, UploadBatch } from "@/lib/types";

/**
 * 데이터 소스 추상화 (서버 전용).
 * - Supabase 미설정 → 더미 데이터 (화면 검토용)
 * - Supabase 설정   → 실제 DB 조회 (누적 데이터)
 * 모든 메뉴(대시보드/원본조회/불만족관리)가 이 로더를 통해 동일 누적 데이터를 본다.
 */

/** 현재 더미 모드 여부 (클라이언트 분기용으로 페이지에서 전달) */
export function isDummyMode(): boolean {
  return !isSupabaseConfigured();
}

/** satisfaction 누적 데이터 로드 (record_no 오름차순) */
export async function loadSatisfaction(): Promise<Satisfaction[]> {
  if (isDummyMode()) return getDummySatisfaction();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("satisfaction")
    .select(
      "id, record_no, record_key, query, summary_text, rating, reason, comment, created_at, upload_batch_id, synced_at",
    )
    .order("record_no", { ascending: true });

  if (error) {
    console.error("loadSatisfaction 실패:", error.message);
    return [];
  }
  return (data ?? []) as Satisfaction[];
}

/**
 * 작성자 표시명 매핑: profiles(id → 이름).
 * 이름이 있으면 이름, 없으면 사번, 둘 다 없으면 uuid 폴백.
 */
async function loadActorNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, emp_no, name");
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    if (!p.id) continue;
    const display =
      (p.name as string | null) || (p.emp_no as string | null) || (p.id as string);
    map.set(p.id as string, display);
  }
  return map;
}

/** feedback 로드. created_by/updated_by(uuid)를 표시용 이름(없으면 사번)으로 변환 */
export async function loadFeedback(): Promise<Feedback[]> {
  if (isDummyMode()) return getDummyFeedback();

  const supabase = await createClient();
  const [{ data, error }, actorMap] = await Promise.all([
    supabase
      .from("feedback")
      .select(
        "id, satisfaction_id, status, detail_reason, cause_category, action, memo, created_by, updated_by, created_at, updated_at",
      ),
    loadActorNameMap(supabase),
  ]);

  if (error) {
    console.error("loadFeedback 실패:", error.message);
    return [];
  }

  return (data ?? []).map((f) => ({
    id: f.id as string,
    satisfaction_id: f.satisfaction_id as string,
    status: f.status as Feedback["status"],
    detail_reason: (f.detail_reason as string | null) ?? null,
    cause_category: (f.cause_category as string | null) ?? null,
    action: (f.action as string | null) ?? null,
    memo: (f.memo as string | null) ?? null,
    created_by: f.created_by
      ? (actorMap.get(f.created_by as string) ?? (f.created_by as string))
      : null,
    updated_by: f.updated_by
      ? (actorMap.get(f.updated_by as string) ?? (f.updated_by as string))
      : null,
    created_at: f.created_at as string,
    updated_at: f.updated_at as string,
  }));
}

/** 사번 → 이름 매핑 (profiles). 업로더 표시명 변환용 */
async function loadEmpNoToNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("emp_no, name");
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    const emp = p.emp_no as string | null;
    const name = p.name as string | null;
    if (emp && name) map.set(emp, name);
  }
  return map;
}

/**
 * 최근 업로드 이력 로드 (DB 모드만). 더미 모드는 빈 배열.
 * uploaded_by(사번)는 표시용 이름으로 변환한다(없으면 사번 폴백).
 * DB 의 upload_batches.uploaded_by 값 자체는 변경하지 않는다.
 */
export async function loadRecentBatches(limit = 5): Promise<UploadBatch[]> {
  if (isDummyMode()) return getDummyBatches().slice(0, limit);

  const supabase = await createClient();
  const [{ data, error }, nameMap] = await Promise.all([
    supabase
      .from("upload_batches")
      .select(
        "id, file_name, uploaded_by, uploaded_at, row_count, inserted_count, updated_count, failed_count, duplicate_count, status, error_message",
      )
      .order("uploaded_at", { ascending: false })
      .limit(limit),
    loadEmpNoToNameMap(supabase),
  ]);

  if (error) {
    console.error("loadRecentBatches 실패:", error.message);
    return [];
  }
  return (data ?? []).map((b) => ({
    ...(b as UploadBatch),
    uploaded_by: b.uploaded_by
      ? (nameMap.get(b.uploaded_by as string) ?? (b.uploaded_by as string))
      : null,
  }));
}
