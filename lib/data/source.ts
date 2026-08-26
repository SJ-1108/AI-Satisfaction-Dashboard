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
  SatisfactionStat,
  UploadBatch,
} from "@/lib/types";
import { normalizeStatus } from "@/lib/types";

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

// ── 전체 행 조회 (PostgREST max-rows 회피) ──────────────────
/**
 * PostgREST 는 한 요청이 돌려주는 행 수를 max-rows(Supabase 기본 1000)로 제한한다.
 * `.range()` 없이 select 하면 초과분이 **에러 없이 조용히 잘려서** 돌아오므로,
 * 누적 데이터가 1000행을 넘는 순간 최근 적재분이 화면에서 사라진다.
 *
 * 실패 처리 원칙(장애 재발 방지):
 *   조회 실패를 빈 배열로 바꿔 반환하면 그 빈 값이 unstable_cache 에 저장되어
 *   화면이 통째로 비는 사고가 난다. 그래서 이 계층은 **실패하면 throw** 하고,
 *   폴백 여부는 호출 측이 정한다. (throw 된 값은 캐시에 저장되지 않는다)
 */
const FETCH_PAGE_SIZE = 1000;

/** 무한 루프 방지 상한 (1000행 × 200페이지 = 20만 행) */
const FETCH_MAX_PAGES = 200;

interface PageResponse {
  data: unknown[] | null;
  error: { message: string } | null;
}

/**
 * from~to 범위를 받아 한 페이지를 조회하는 함수를 넘기면, 빈 페이지가 나올 때까지
 * 이어 읽어 전체 행을 반환한다. 실패 시 throw.
 *
 * 전제: fetchPage 의 정렬은 반드시 유일값(id)으로 tie-break 되어야 한다.
 *       정렬이 불안정하면 페이지 경계에서 행이 중복되거나 누락된다.
 */
async function fetchPagedRows(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<PageResponse>,
): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 0; page < FETCH_MAX_PAGES; page++) {
    const from = all.length;
    const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${label} 페이지 조회 실패(offset=${from}): ${error.message}`);
    }
    const batch = data ?? [];
    all.push(...batch);
    // 빈 페이지 = 끝. (max-rows 가 FETCH_PAGE_SIZE 보다 작게 설정돼 있어도
    //  실제로 받은 만큼만 전진하므로 안전하다.)
    if (batch.length === 0) return all;
  }
  throw new Error(`${label}: 페이지 상한(${FETCH_MAX_PAGES}) 초과`);
}

/**
 * 폴백용 단일 조회(기존 방식) — max-rows 상한까지만 돌아올 수 있다.
 * 페이지 조회가 실패해도 최소한 기존 동작만큼은 보장하기 위한 안전망. 실패 시 throw.
 */
async function fetchSingleRows(
  label: string,
  fetchOnce: () => PromiseLike<PageResponse>,
): Promise<unknown[]> {
  const { data, error } = await fetchOnce();
  if (error) throw new Error(`${label} 단일 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 에러 메시지 문자열화 (로그용) */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 현재 더미 모드 여부 (클라이언트 분기용으로 페이지에서 전달) */
export function isDummyMode(): boolean {
  return !isSupabaseConfigured();
}

// ── satisfaction ────────────────────────────────────────────
const SATISFACTION_COLS =
  "id, record_no, record_key, query, summary_text, rating, reason, comment, device_type, guardrail_label, created_at, upload_batch_id, synced_at";

/**
 * satisfaction 전체 행 조회.
 * 1순위: 페이지 이어읽기(전체 행 보장).
 * 2순위: 실패 시 기존 단일 조회로 폴백 — max-rows 로 잘릴 수 있지만
 *        "아무것도 안 보이는" 상태보다는 낫다. 둘 다 실패하면 throw.
 */
async function readSatisfaction(): Promise<Satisfaction[]> {
  const admin = createAdminClient();
  try {
    // record_no 는 트리거(max+1)로 부여되어 유일성이 보장되지 않는다(대량/동시 적재 시
    // 같은 값이 나올 수 있음). 페이지 경계가 흔들리지 않도록 id 로 tie-break 한다.
    return (await fetchPagedRows("loadSatisfaction", (from, to) =>
      admin
        .from("satisfaction")
        .select(SATISFACTION_COLS)
        .order("record_no", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    )) as Satisfaction[];
  } catch (e) {
    console.error(`${errText(e)} — 단일 조회로 폴백`);
    return (await fetchSingleRows("loadSatisfaction", () =>
      admin
        .from("satisfaction")
        .select(SATISFACTION_COLS)
        .order("record_no", { ascending: true }),
    )) as Satisfaction[];
  }
}

const getCachedSatisfaction = unstable_cache(readSatisfaction, ["satisfaction-all"], {
  tags: [CACHE_TAGS.satisfaction],
  revalidate: CACHE_TTL,
});

/** satisfaction 누적 데이터 로드 (record_no 오름차순) */
export async function loadSatisfaction(): Promise<Satisfaction[]> {
  if (isDummyMode()) return getDummySatisfaction();
  try {
    return await getCachedSatisfaction();
  } catch (e) {
    // 실패는 캐시에 저장되지 않는다(throw). 캐시를 건너뛰고 한 번 더 시도한다.
    console.error("loadSatisfaction 실패:", errText(e));
    try {
      return await readSatisfaction();
    } catch (e2) {
      console.error("loadSatisfaction 재시도 실패:", errText(e2));
      return [];
    }
  }
}

/**
 * satisfaction 실제 총 건수(진단용). head:true 라 행 데이터를 받지 않아 매우 가볍다.
 * 화면에 로드된 건수와 비교해, 조회가 잘렸는지를 즉시 드러내는 데 쓴다.
 * (실패해도 화면을 막지 않도록 null 반환 — 이 값은 표시용일 뿐 데이터가 아니다)
 */
const getCachedSatisfactionCount = unstable_cache(
  async (): Promise<number | null> => {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("satisfaction")
      .select("id", { count: "exact", head: true });
    if (error) {
      console.error("loadSatisfactionCount 실패:", error.message);
      return null;
    }
    return count ?? null;
  },
  ["satisfaction-count"],
  { tags: [CACHE_TAGS.satisfaction], revalidate: CACHE_TTL },
);

/** DB 기준 satisfaction 총 건수 (조회 누락 감지용). 알 수 없으면 null. */
export async function loadSatisfactionCount(): Promise<number | null> {
  if (isDummyMode()) return getDummySatisfaction().length;
  return getCachedSatisfactionCount();
}

// ── 집계 전용 경량 조회 (대시보드) ──────────────────────────
/**
 * 대시보드 집계에 실제로 쓰이는 컬럼만 조회한다.
 * summary_text(행당 3KB 안팎)를 빼면 페이로드가 ~97% 줄어, 누적 데이터가
 * 수만 행이 돼도 서버→브라우저 전송량이 문제되지 않는다.
 * 집계 함수(dashboard-stats)는 이 좁은 형태만 요구하므로 로직 변경이 없다.
 */
const SATISFACTION_STAT_COLS = "id, rating, reason, created_at";

async function readSatisfactionStats(): Promise<SatisfactionStat[]> {
  const admin = createAdminClient();
  try {
    return (await fetchPagedRows("loadSatisfactionStats", (from, to) =>
      admin
        .from("satisfaction")
        .select(SATISFACTION_STAT_COLS)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    )) as SatisfactionStat[];
  } catch (e) {
    console.error(`${errText(e)} — 단일 조회로 폴백`);
    return (await fetchSingleRows("loadSatisfactionStats", () =>
      admin.from("satisfaction").select(SATISFACTION_STAT_COLS),
    )) as SatisfactionStat[];
  }
}

const getCachedSatisfactionStats = unstable_cache(
  readSatisfactionStats,
  ["satisfaction-stats"],
  { tags: [CACHE_TAGS.satisfaction], revalidate: CACHE_TTL },
);

/** 집계용 경량 satisfaction 로드 (대시보드 전용). */
export async function loadSatisfactionStats(): Promise<SatisfactionStat[]> {
  if (isDummyMode()) return getDummySatisfaction();
  try {
    return await getCachedSatisfactionStats();
  } catch (e) {
    console.error("loadSatisfactionStats 실패:", errText(e));
    try {
      return await readSatisfactionStats();
    } catch (e2) {
      console.error("loadSatisfactionStats 재시도 실패:", errText(e2));
      return [];
    }
  }
}

// ── 불만족(down) 전용 조회 (불만족 평가 관리) ────────────────
/**
 * 불만족 관리 화면은 rating='down' 행만 쓴다. 전체를 받아 앱에서 거르는 대신
 * DB 에서 걸러 가져와, 만족(up) 행의 summary_text 를 통째로 실어 나르지 않는다.
 */
async function readDownSatisfaction(): Promise<Satisfaction[]> {
  const admin = createAdminClient();
  try {
    return (await fetchPagedRows("loadDownSatisfaction", (from, to) =>
      admin
        .from("satisfaction")
        .select(SATISFACTION_COLS)
        .eq("rating", "down")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    )) as Satisfaction[];
  } catch (e) {
    console.error(`${errText(e)} — 단일 조회로 폴백`);
    return (await fetchSingleRows("loadDownSatisfaction", () =>
      admin.from("satisfaction").select(SATISFACTION_COLS).eq("rating", "down"),
    )) as Satisfaction[];
  }
}

const getCachedDownSatisfaction = unstable_cache(
  readDownSatisfaction,
  ["satisfaction-down"],
  { tags: [CACHE_TAGS.satisfaction], revalidate: CACHE_TTL },
);

/** 불만족(down) satisfaction 로드 (불만족 관리 화면 전용). */
export async function loadDownSatisfaction(): Promise<Satisfaction[]> {
  if (isDummyMode()) {
    return getDummySatisfaction().filter((s) => s.rating === "down");
  }
  try {
    return await getCachedDownSatisfaction();
  } catch (e) {
    console.error("loadDownSatisfaction 실패:", errText(e));
    try {
      return await readDownSatisfaction();
    } catch (e2) {
      console.error("loadDownSatisfaction 재시도 실패:", errText(e2));
      return [];
    }
  }
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
const FEEDBACK_COLS =
  "id, satisfaction_id, status, detail_reason, cause_category, related_department, action, memo, created_by, updated_by, created_at, updated_at";

/** feedback 전체 행 조회. satisfaction 과 동일한 폴백 전략. 실패 시 throw. */
async function readFeedbackRows(admin: SupabaseClient): Promise<unknown[]> {
  try {
    // 페이지 경계 안정성을 위해 유일값(id)으로 정렬한다(기존에는 정렬이 없었다).
    return await fetchPagedRows("loadFeedback", (from, to) =>
      admin
        .from("feedback")
        .select(FEEDBACK_COLS)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (e) {
    console.error(`${errText(e)} — 단일 조회로 폴백`);
    return await fetchSingleRows("loadFeedback", () =>
      admin.from("feedback").select(FEEDBACK_COLS),
    );
  }
}

async function readFeedback(): Promise<Feedback[]> {
  const admin = createAdminClient();
  const [rows, actorMap] = await Promise.all([
    readFeedbackRows(admin),
    loadActorNameMap(admin),
  ]);

  return (rows as Record<string, unknown>[]).map((f) => ({
    id: f.id as string,
    satisfaction_id: f.satisfaction_id as string,
    // 저장값으로 정규화: 과거 표기 '처리완료'가 남아 있어도 '조치완료'로 흡수
    status: normalizeStatus(f.status as string | null),
    detail_reason: (f.detail_reason as string | null) ?? null,
    cause_category: (f.cause_category as string | null) ?? null,
    related_department: (f.related_department as string | null) ?? null,
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

const getCachedFeedback = unstable_cache(readFeedback, ["feedback-all"], {
  // 작성자명은 profiles 에 의존하므로 feedback 무효화 시 함께 갱신
  tags: [CACHE_TAGS.feedback],
  revalidate: CACHE_TTL,
});

/** feedback 로드. created_by/updated_by(uuid)를 표시용 이름(없으면 사번)으로 변환 */
export async function loadFeedback(): Promise<Feedback[]> {
  if (isDummyMode()) return getDummyFeedback();
  try {
    return await getCachedFeedback();
  } catch (e) {
    console.error("loadFeedback 실패:", errText(e));
    try {
      return await readFeedback();
    } catch (e2) {
      console.error("loadFeedback 재시도 실패:", errText(e2));
      return [];
    }
  }
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
