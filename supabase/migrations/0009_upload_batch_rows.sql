-- ============================================================================
-- 0009_upload_batch_rows.sql — 업로드 row별 처리 결과 로그
-- 목적:
--   업로드한 엑셀/CSV 의 각 데이터 행이 이번 업로드에서 어떻게 처리되었는지
--   (신규 insert / 갱신 update / 파일 내 중복 duplicate / 실패 failed) 를
--   행 단위로 저장해, 나중에 Supabase SQL 로 "어떤 row 가 갱신됐는지" 등을
--   사후 확인할 수 있게 한다.
--
-- 주의:
--   * satisfaction / feedback / upload_batches 기존 구조는 건드리지 않는다.
--   * record_key(중복/갱신 판단 기준)는 변경하지 않는다. 이 테이블은 "결과 기록"만 한다.
--   * 쓰기는 앱에서 service-role(admin) 로 하므로 RLS 를 우회하지만,
--     조회 편의를 위해 authenticated select/insert 정책을 둔다.
--   * upload_batch 삭제(초기화) 시 함께 지워지도록 on delete cascade.
--   * action 은 4종만 허용(insert/update/duplicate/failed) — upload_batches 집계와 1:1.
-- (0003/0008 적용 후 실행. 재실행 안전)
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.upload_batch_rows (
  id                     uuid primary key default gen_random_uuid(),
  upload_batch_id        uuid not null
                           references public.upload_batches (id) on delete cascade,
  row_number             integer not null,          -- 원본 파일 행 번호(헤더 제외 1-base)
  action                 text not null
                           check (action in ('insert', 'update', 'duplicate', 'failed')),
  record_key             text,                       -- 중복/갱신 판단 해시 (failed 는 null)
  satisfaction_id        uuid
                           references public.satisfaction (id) on delete set null,
  -- 처리 당시 행 값(스냅샷) — 사후 확인용
  query                  text,
  rating                 text,
  reason                 text,
  comment                text,
  summary_text           text,
  feedback_created_at    timestamptz,                -- 원본 created_at(평가 시각)
  device_type            text,
  guardrail_label        text,
  -- 갱신(update) 시 실제 변화 확인용 before/after
  --  (record_key 가 같아야 update 이므로, 실제로 달라질 수 있는 값은
  --   device_type / guardrail_label 뿐이다 — 이를 명시적으로 남긴다)
  device_type_before     text,
  device_type_after      text,
  guardrail_label_before text,
  guardrail_label_after  text,
  error_message          text,                       -- failed 사유
  raw_row                jsonb,                       -- 원본 행 전체(진단용)
  created_at             timestamptz not null default now(),
  -- 한 배치 안에서 원본 행 번호는 유일(한 행 = 한 처리 결과)
  constraint uq_upload_batch_rows_batch_row unique (upload_batch_id, row_number)
);

create index if not exists idx_ubr_upload_batch_id  on public.upload_batch_rows (upload_batch_id);
create index if not exists idx_ubr_action           on public.upload_batch_rows (action);
create index if not exists idx_ubr_record_key        on public.upload_batch_rows (record_key);
create index if not exists idx_ubr_satisfaction_id   on public.upload_batch_rows (satisfaction_id);
create index if not exists idx_ubr_created_at        on public.upload_batch_rows (created_at desc);

-- ----------------------------------------------------------------------------
-- RLS: 조회/삽입은 인증 사용자 허용. update/delete 정책은 두지 않는다(불변 로그).
--      (앱은 service-role 로 삽입 → RLS 우회. 아래 정책은 SQL Editor/조회 편의용)
-- ----------------------------------------------------------------------------
alter table public.upload_batch_rows enable row level security;

drop policy if exists upload_batch_rows_select on public.upload_batch_rows;
create policy upload_batch_rows_select on public.upload_batch_rows
  for select to authenticated using (true);

drop policy if exists upload_batch_rows_insert on public.upload_batch_rows;
create policy upload_batch_rows_insert on public.upload_batch_rows
  for insert to authenticated with check (true);

-- PostgREST 스키마 캐시 리로드(신규 테이블 즉시 인식)
notify pgrst, 'reload schema';
