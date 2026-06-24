# 5인 계정 시드 절차 (FR-0.2)

사용자는 **사번 + 비밀번호**로만 로그인합니다. 이메일은 `사번 → {사번}@<도메인>`으로
내부 변환되며 화면에 노출되지 않습니다 (기본 도메인: `internal.local`).

회원가입 기능은 없으므로 관리자가 5인 계정을 **사전 생성(시드)** 합니다.

## 사전 준비

1. Supabase 프로젝트 생성 후 `0001_init.sql` 마이그레이션을 적용합니다.
   - Supabase 대시보드 → SQL Editor 에 `supabase/migrations/0001_init.sql` 내용을 붙여넣고 실행, 또는
   - Supabase CLI: `supabase db push`
2. `.env.local.example` 을 `.env.local` 로 복사하고 아래 값을 채웁니다.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)
   - `NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN` (기본 `internal.local`)

## 방법 A — 스크립트로 일괄 생성 (권장)

1. `scripts/accounts.example.json` 을 `scripts/accounts.json` 으로 복사하고
   실제 사번/이름/초기 비밀번호를 입력합니다. (이 파일은 `.gitignore` 처리됨)
2. 실행:
   ```bash
   node --env-file=.env.local scripts/seed-accounts.mjs
   ```
3. 콘솔에 `✓ <사번> 생성` 5건이 출력되면 완료입니다.
   - `0001_init.sql` 의 `on_auth_user_created` 트리거가 `profiles` 행을 자동 생성합니다.

## 방법 B — Supabase 대시보드 수동 생성

1. Authentication → Users → **Add user** → Create new user
2. Email 에 `사번@internal.local` (예: `20240278@internal.local`), 비밀번호 입력,
   **Auto Confirm User** 체크.
3. 생성 후 트리거가 동작하려면 user_metadata 가 필요하므로,
   SQL Editor 에서 profiles 를 보완 입력합니다 (방법 A가 더 간편):
   ```sql
   update public.profiles
     set emp_no = '20240278', name = '홍길동'
   where id = '<해당 user id>';
   ```

## 비밀번호 재설정 (FR-0.2)

- 1차에는 관리자가 Supabase 대시보드(Authentication → Users → 해당 사용자 →
  Reset password / Update password)에서 재설정합니다.
- 셀프 재설정(이메일 발송)은 내부 이메일 도메인 특성상 메일 수신이 불가하므로
  1차 범위에서는 사용하지 않습니다. (정책 확정 필요 — PRD 11절)
