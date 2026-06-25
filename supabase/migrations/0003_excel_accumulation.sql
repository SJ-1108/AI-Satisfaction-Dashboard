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
                    check (status in ('미확인', '검토중', '조치완료', '보류')),
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
