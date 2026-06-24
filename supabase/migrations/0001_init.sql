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
                    check (status in ('미확인', '검토중', '조치완료', '보류')),
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
