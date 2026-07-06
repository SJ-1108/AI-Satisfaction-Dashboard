-- ============================================================
-- 0001_init.sql
-- ============================================================
-- ============================================================================
-- 0001_init.sql — 초기 스키마 (PRD 5.1 / 6 / 8 기준)
-- 테이블: satisfaction, feedback, profiles
-- 보안: RLS (NFR-1), 인덱스 (NFR-4)
-- ============================================================================

-- gen_random_uuid() 사용을 위해 (Supabase는 기본 제공되나 안전하게 명시)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles : 계정 (auth.users 1:1 연결). 화면 표시는 emp_no/name 기준.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  emp_no  text not null unique,            -- 사번
  name    text
);

-- ----------------------------------------------------------------------------
-- satisfaction : 평가 원본 (Metabase 동기화/업로드로 적재).
-- search_event_id 가 PK 이므로 upsert 멱등 적재 보장 (FR-1.3).
-- ----------------------------------------------------------------------------
create table if not exists public.satisfaction (
  search_event_id text primary key,        -- 검색 이벤트 고유 ID
  query           text,                    -- 검색어
  summary_text    text,                    -- AI 요약 응답
  rating          text not null check (rating in ('up', 'down')),  -- 만족/불만족
  reason          text,                    -- 평가 사유 코드 (예: insufficient)
  comment         text,                    -- 사용자 자유 의견
  created_at      timestamptz not null,    -- 평가 시각 (기간/추이/필터)
  synced_at       timestamptz not null default now()  -- 적재/동기화 시각
);

-- 조회/집계 성능 인덱스 (NFR-4)
create index if not exists idx_satisfaction_created_at on public.satisfaction (created_at);
create index if not exists idx_satisfaction_rating     on public.satisfaction (rating);
create index if not exists idx_satisfaction_reason     on public.satisfaction (reason);

-- ----------------------------------------------------------------------------
-- feedback : 불만족 관리 내부 피드백 (search_event_id 1:1).
-- 팀이 직접 입력. 작성자 자동 기록 (FR-0.3 / FR-4.2).
-- ----------------------------------------------------------------------------
create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  search_event_id text not null unique
                    references public.satisfaction (search_event_id) on delete cascade,
  status          text not null default '미확인'
                    check (status in ('미확인', '검토중', '조치완료', '보류', '처리 불가')),
  detail_reason   text,                    -- 상세 사유 (구분값, 통계축)
  cause_category  text,                    -- 원인 분류
  action          text,                    -- 조치 내용
  memo            text,                    -- 메모
  created_by      uuid references auth.users (id) default auth.uid(),
  updated_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_feedback_status on public.feedback (status);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feedback_updated_at on public.feedback;
create trigger trg_feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 신규 auth.users 생성 시 profiles 자동 생성 (시드 편의).
-- user_metadata 의 emp_no / name 을 사용한다.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, emp_no, name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'emp_no',
    new.raw_user_meta_data ->> 'name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- RLS (NFR-1): 미인증 접근 차단. 1차 단일 권한 — 인증된 5인은 모두 동일 권한.
-- service-role 키는 RLS를 우회하므로 적재/동기화는 정책 영향 없음.
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.satisfaction enable row level security;
alter table public.feedback     enable row level security;

-- profiles: 인증 사용자는 읽기 가능
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- satisfaction: 인증 사용자는 읽기만 가능 (쓰기는 service-role 전용 → 정책 없음 = 거부)
drop policy if exists satisfaction_select on public.satisfaction;
create policy satisfaction_select on public.satisfaction
  for select to authenticated using (true);

-- feedback: 인증 사용자는 읽기/쓰기/수정 가능 (실시간 공유, FR-4.5)
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated using (true);

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (created_by = auth.uid());      -- 작성자 = 로그인 사용자 강제

drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback
  for update to authenticated
  using (true)
  with check (updated_by = auth.uid());       -- 수정자 = 로그인 사용자 강제


-- ============================================================
-- 0002_must_change_password.sql
-- ============================================================
-- ============================================================================
-- 0002_must_change_password.sql — 최초 로그인 시 비밀번호 변경 강제
-- profiles.must_change_password 추가 + handle_new_user 트리거 보강
-- (0001_init.sql 적용 후 실행. 재실행 안전 — idempotent)
-- ============================================================================

-- 신규 계정은 기본적으로 비밀번호 변경이 필요한 상태로 생성된다.
alter table public.profiles
  add column if not exists must_change_password boolean not null default true;

-- 신규 auth.users 생성 시 profiles 자동 생성 (must_change_password 포함).
-- user_metadata 에 값이 있으면 사용하고, 없으면 true (변경 강제).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, emp_no, name, must_change_password)
  values (
    new.id,
    new.raw_user_meta_data ->> 'emp_no',
    new.raw_user_meta_data ->> 'name',
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- must_change_password 해제는 service-role(서버 액션)로만 수행한다.
-- (anon/authenticated 에는 profiles UPDATE 정책을 부여하지 않음 = 일반 사용자 직접 변경 불가)


-- ============================================================
-- 0003_excel_accumulation.sql
-- ============================================================
-- ============================================================================
-- 0003_excel_accumulation.sql — 엑셀 업로드 누적 저장 구조
-- 변경 요지:
--   * search_event_id(개인정보) 제거 → satisfaction.id UUID PK
--   * record_key(중복 방지 해시), record_no(누적 표시번호), upload_batch_id 추가
--   * feedback 연결키: search_event_id → satisfaction_id (FK)
--   * upload_batches(업로드 이력) 신규
-- 주의: profiles(계정/인증)는 건드리지 않는다. satisfaction/feedback 는
--       운영 데이터 적재 전이므로 재생성한다.
-- (0001/0002 적용 후 실행. 재실행 안전)
-- ============================================================================

create extension if not exists pgcrypto;

-- 기존(0001) 구조 제거 — search_event_id 기반 satisfaction/feedback 폐기.
drop table if exists public.feedback cascade;
drop table if exists public.satisfaction cascade;

-- ----------------------------------------------------------------------------
-- upload_batches : 업로드 이력 (FR 운영)
-- ----------------------------------------------------------------------------
create table if not exists public.upload_batches (
  id              uuid primary key default gen_random_uuid(),
  file_name       text,
  uploaded_by     text,                       -- 표시용 사번 (감사 로그)
  uploaded_at     timestamptz not null default now(),
  row_count       integer not null default 0, -- 파일 전체 데이터 행
  inserted_count  integer not null default 0,
  updated_count   integer not null default 0,
  failed_count    integer not null default 0,
  duplicate_count integer not null default 0,
  status          text not null default 'completed',
  error_message   text
);

create index if not exists idx_upload_batches_uploaded_at
  on public.upload_batches (uploaded_at desc);

-- ----------------------------------------------------------------------------
-- satisfaction : 평가 원본 (엑셀 업로드 누적 / 추후 Metabase 동기화)
--   id           : 내부 식별자 (개인정보 아님)
--   record_key   : 중복 방지 해시 (개인정보 아닌 컬럼 조합) — UNIQUE
--   record_no    : 누적 표시번호 (운영 관리/화면용, 식별/연결키로 사용 금지)
-- ----------------------------------------------------------------------------
create table public.satisfaction (
  id              uuid primary key default gen_random_uuid(),
  record_no       bigint not null,            -- 트리거가 자동 부여 (max+1)
  record_key      text not null unique,       -- 중복 업로드 방지
  query           text,
  summary_text    text,
  rating          text not null check (rating in ('up', 'down')),
  reason          text,
  comment         text,
  created_at      timestamptz not null,       -- 평가 시각
  upload_batch_id uuid references public.upload_batches (id),
  synced_at       timestamptz not null default now()
);

create index if not exists idx_satisfaction_created_at on public.satisfaction (created_at);
create index if not exists idx_satisfaction_rating     on public.satisfaction (rating);
create index if not exists idx_satisfaction_reason     on public.satisfaction (reason);
create index if not exists idx_satisfaction_record_no  on public.satisfaction (record_no);

-- record_no 누적 자동 넘버링: 기존 최대값 + 1 (신규 INSERT 시에만).
-- 동일 record_key 재업로드는 UPDATE 경로이므로 record_no 가 바뀌지 않는다.
create or replace function public.set_record_no()
returns trigger
language plpgsql
as $$
begin
  if new.record_no is null or new.record_no = 0 then
    select coalesce(max(record_no), 0) + 1 into new.record_no
      from public.satisfaction;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_satisfaction_record_no on public.satisfaction;
create trigger trg_satisfaction_record_no
  before insert on public.satisfaction
  for each row execute function public.set_record_no();

-- ----------------------------------------------------------------------------
-- feedback : 불만족 관리 (satisfaction_id 1:1 연결)
-- 재업로드 시 satisfaction.id 가 유지되므로 feedback 연결도 유지된다.
-- ----------------------------------------------------------------------------
create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  satisfaction_id uuid not null unique
                    references public.satisfaction (id) on delete cascade,
  status          text not null default '미확인'
                    check (status in ('미확인', '검토중', '조치완료', '보류', '처리 불가')),
  detail_reason   text,
  cause_category  text,
  action          text,
  memo            text,
  created_by      uuid references auth.users (id) default auth.uid(),
  updated_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_feedback_status on public.feedback (status);

-- updated_at 자동 갱신 (set_updated_at 함수는 0001 에서 생성됨)
drop trigger if exists trg_feedback_updated_at on public.feedback;
create trigger trg_feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS (NFR-1)
-- 읽기: 인증 사용자. 쓰기: satisfaction/upload_batches 는 service-role 전용(정책 없음),
--       feedback 는 인증 사용자(작성자/수정자 = 본인 강제).
-- ============================================================================
alter table public.satisfaction   enable row level security;
alter table public.feedback       enable row level security;
alter table public.upload_batches enable row level security;

drop policy if exists satisfaction_select on public.satisfaction;
create policy satisfaction_select on public.satisfaction
  for select to authenticated using (true);

drop policy if exists upload_batches_select on public.upload_batches;
create policy upload_batches_select on public.upload_batches
  for select to authenticated using (true);

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated using (true);

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback
  for update to authenticated
  using (true)
  with check (updated_by = auth.uid());


-- ============================================================
-- 0004_reset_logs.sql
-- ============================================================
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


-- ============================================================
-- 0006_related_department.sql
-- ============================================================
-- ----------------------------------------------------------------------------
-- 0006: 불만족 피드백에 '유관 부서'(related_department) 컬럼 추가.
--   * nullable text. 고정 목록은 UI(드롭다운)에서만 강제하므로 CHECK 제약은 두지 않는다
--     (현행 cause_category 도 free text 이며 동일 방식).
-- ----------------------------------------------------------------------------

alter table public.feedback add column related_department text; -- 유관 부서


