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
