import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getDummyBatches,
  getDummyFeedback,
  getDummyResetLogs,
  getDummySatisfaction,
} from "@/lib/data/dummy-store";
import type {
  Feedback,
  ResetLog,
  Satisfaction,
  UploadBatch,
} from "@/lib/types";

/**
 * 데이터 소스 추상화 (서버 전용).
 * - Supabase 미설정 → 더미 데이터 (화면 검토용)
 * - Supabase 설정   → 실제 DB 조회 (누적 데이터)
 * 모든 메뉴(대시보드/원본조회/불만족관리)가 이 로더를 통해 동일 누적 데이터를 본다.
 *
 * 성능: SELECT 데이터는 모든 인증 사용자에게 동일(RLS `using(true)`)하므로
 * Next.js Data Cache(unstable_cache)로 전역 캐시하고, 변경 액션에서 태그로 무효화한다.
 * 캐시 함수는 쿠키 스코프 밖에서 실행되므로 service-role(admin) 클라이언트로 조회한다.
 * (메타베이스 자동 동기화 등 앱 외부 쓰기 대비 안전 TTL 60초 적용)
 */

/** 데이터 캐시 태그 — 업로드/피드백/초기화 액션에서 revalidateTag 로 무효화 */
export const CACHE_TAGS = {
  satisfaction: "satisfaction",
  feedback: "feedback",
  batches: "upload-batches",
  resetLogs: "reset-logs",
} as const;

/** 외부(메타베이스 동기화) 쓰기 대비 안전 TTL(초). 태그 무효화가 1차, TTL이 2차. */
const CACHE_TTL = 60;

/** 현재 더미 모드 여부 (클라이언트 분기용으로 페이지에서 전달) */
export function isDummyMode(): boolean {
  return !isSupabaseConfigured();
}

// ── satisfaction ────────────────────────────────────────────
const SATISFACTION_COLS =
  "id, record_no, record_key, query, summary_text, rating, reason, comment, created_at, upload_batch_id, synced_at";

const getCachedSatisfaction = unstable_cache(
  async (): Promise<Satisfaction[]> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("satisfaction")
      .select(SATISFACTION_COLS)
      .order("record_no", { ascending: true });
    if (error) {
      console.error("loadSatisfaction 실패:", error.message);
      return [];
    }
    return (data ?? []) as Satisfaction[];
  },
  ["satisfaction-all"],
  { tags: [CACHE_TAGS.satisfaction], revalidate: CACHE_TTL },
);

/** satisfaction 누적 데이터 로드 (record_no 오름차순) */
export async function loadSatisfaction(): Promise<Satisfaction[]> {
  if (isDummyMode()) return getDummySatisfaction();
  return getCachedSatisfaction();
}

// ── profiles 이름 매핑 ───────────────────────────────────────
/**
 * 작성자 표시명 매핑: profiles(id → 이름).
 * 이름이 있으면 이름, 없으면 사번, 둘 다 없으면 uuid 폴백.
 */
async function loadActorNameMap(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  const { data } = await client.from("profiles").select("id, emp_no, name");
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    if (!p.id) continue;
    const display =
      (p.name as string | null) || (p.emp_no as string | null) || (p.id as string);
    map.set(p.id as string, display);
  }
  return map;
}

/** 사번 → 이름 매핑 (profiles). 업로더 표시명 변환용 */
async function loadEmpNoToNameMap(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  const { data } = await client.from("profiles").select("emp_no, name");
  const map = new Map<string, string>();
  for (const p of data ?? []) {
    const emp = p.emp_no as string | null;
    const name = p.name as string | null;
    if (emp && name) map.set(emp, name);
  }
  return map;
}

// ── feedback ────────────────────────────────────────────────
const getCachedFeedback = unstable_cache(
  async (): Promise<Feedback[]> => {
    const admin = createAdminClient();
    const [{ data, error }, actorMap] = await Promise.all([
      admin
        .from("feedback")
        .select(
          "id, satisfaction_id, status, detail_reason, cause_category, action, memo, created_by, updated_by, created_at, updated_at",
        ),
      loadActorNameMap(admin),
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
  },
  ["feedback-all"],
  // 작성자명은 profiles 에 의존하므로 feedback 무효화 시 함께 갱신
  { tags: [CACHE_TAGS.feedback], revalidate: CACHE_TTL },
);

/** feedback 로드. created_by/updated_by(uuid)를 표시용 이름(없으면 사번)으로 변환 */
export async function loadFeedback(): Promise<Feedback[]> {
  if (isDummyMode()) return getDummyFeedback();
  return getCachedFeedback();
}

// ── upload_batches ──────────────────────────────────────────
const getCachedBatches = unstable_cache(
  async (limit: number): Promise<UploadBatch[]> => {
    const admin = createAdminClient();
    const [{ data, error }, nameMap] = await Promise.all([
      admin
        .from("upload_batches")
        .select(
          "id, file_name, uploaded_by, uploaded_at, row_count, inserted_count, updated_count, failed_count, duplicate_count, status, error_message",
        )
        .order("uploaded_at", { ascending: false })
        .limit(limit),
      loadEmpNoToNameMap(admin),
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
  },
  ["recent-batches"],
  { tags: [CACHE_TAGS.batches], revalidate: CACHE_TTL },
);

/**
 * 최근 업로드 이력 로드 (DB 모드만). 더미 모드는 빈 배열.
 * uploaded_by(사번)는 표시용 이름으로 변환한다(없으면 사번 폴백).
 * DB 의 upload_batches.uploaded_by 값 자체는 변경하지 않는다.
 */
export async function loadRecentBatches(limit = 5): Promise<UploadBatch[]> {
  if (isDummyMode()) return getDummyBatches().slice(0, limit);
  return getCachedBatches(limit);
}

// ── reset_logs (데이터 초기화 이력) ──────────────────────────
const getCachedResetLogs = unstable_cache(
  async (limit: number): Promise<ResetLog[]> => {
    const admin = createAdminClient();
    const [{ data, error }, nameMap] = await Promise.all([
      admin
        .from("reset_logs")
        .select(
          "id, reset_by, reset_at, satisfaction_count, feedback_count, batch_count",
        )
        .order("reset_at", { ascending: false })
        .limit(limit),
      loadEmpNoToNameMap(admin),
    ]);

    if (error) {
      console.error("loadResetLogs 실패:", error.message);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      reset_by: r.reset_by
        ? (nameMap.get(r.reset_by as string) ?? (r.reset_by as string))
        : null,
      reset_at: r.reset_at as string,
      satisfaction_count: (r.satisfaction_count as number) ?? 0,
      feedback_count: (r.feedback_count as number) ?? 0,
      batch_count: (r.batch_count as number) ?? 0,
    }));
  },
  ["reset-logs-all"],
  { tags: [CACHE_TAGS.resetLogs], revalidate: CACHE_TTL },
);

/** 데이터 초기화 이력 로드 (최신순). reset_by(사번)는 표시용 이름으로 변환. */
export async function loadResetLogs(limit = 50): Promise<ResetLog[]> {
  if (isDummyMode()) return getDummyResetLogs().slice(0, limit);
  return getCachedResetLogs(limit);
}
