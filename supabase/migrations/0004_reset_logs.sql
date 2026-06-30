-- ============================================================================
-- 0004_reset_logs.sql — 데이터 초기화 이력
-- 변경 요지:
--   * reset_logs(초기화 이력) 신규. 누가·언제·무엇을 몇 건 지웠는지 감사 로그.
--   * 이 표는 데이터 초기화(resetData)로 삭제되지 않는다(이력 보존).
-- (0001~0003 적용 후 실행. 재실행 안전)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- reset_logs : 데이터 초기화 이력 (감사 로그)
--   reset_by : 표시용 사번 (업로드 이력의 uploaded_by 와 동일 규칙)
--   *_count  : 초기화 시점에 삭제된 행 수 (평가/피드백/업로드 이력)
-- ----------------------------------------------------------------------------
create table if not exists public.reset_logs (
  id                  uuid primary key default gen_random_uuid(),
  reset_by            text,                        -- 표시용 사번 (감사 로그)
  reset_at            timestamptz not null default now(),
  satisfaction_count  integer not null default 0,  -- 삭제된 평가 건수
  feedback_count      integer not null default 0,  -- 삭제된 피드백 건수
  batch_count         integer not null default 0   -- 삭제된 업로드 이력 건수
);

create index if not exists idx_reset_logs_reset_at
  on public.reset_logs (reset_at desc);

-- ============================================================================
-- RLS: 읽기는 인증 사용자, 쓰기는 service-role 전용(정책 없음 = 거부).
-- (업로드 적재/초기화는 service-role 로 수행하므로 정책 영향 없음)
-- ============================================================================
alter table public.reset_logs enable row level security;

drop policy if exists reset_logs_select on public.reset_logs;
create policy reset_logs_select on public.reset_logs
  for select to authenticated using (true);
