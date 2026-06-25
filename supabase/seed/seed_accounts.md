# 5인 계정 시드 & 비밀번호 변경 강제 (FR-0.2)

사용자는 **사번 + 비밀번호**로만 로그인합니다. 이메일은 `사번 → {사번}@<도메인>`으로
내부 변환되며 화면에 노출되지 않습니다 (기본 도메인: `megastudyedu.com`).

> 예) `ms20812` → `ms20812@megastudyedu.com`

회원가입 기능은 없으므로 관리자가 5인 계정을 **사전 생성(시드)** 합니다.
**초기 비밀번호 = 사번** 이며, 최초 로그인 후 **비밀번호 변경이 강제**됩니다.

## 사전 준비

1. Supabase 프로젝트 생성 후 마이그레이션을 **순서대로** 적용합니다.
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_must_change_password.sql`
   - `supabase/migrations/0003_excel_accumulation.sql` (satisfaction/feedback 구조 변경 + upload_batches)
   - Supabase 대시보드 → SQL Editor 에 각 파일 내용을 붙여넣고 실행, 또는 `supabase db push`
2. `.env.local.example` 을 `.env.local` 로 복사하고 아래 값을 채웁니다.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (서버 전용 — 절대 프론트 노출 금지)
   - `NEXT_PUBLIC_INTERNAL_EMAIL_DOMAIN=megastudyedu.com`

## 계정 일괄 생성 (스크립트)

1. `scripts/accounts.example.json` 을 `scripts/accounts.json` 으로 복사하고
   실제 **사번/이름**을 입력합니다. (비밀번호 필드 불필요 — 초기 비번은 사번으로 자동 설정)
   - 이 파일은 `.gitignore` 처리되어 커밋되지 않습니다.
   ```json
   [
     { "emp_no": "ms20812", "name": "홍길동" }
   ]
   ```
2. 실행:
   ```bash
   node --env-file=.env.local scripts/seed-accounts.mjs
   ```
3. 출력 예 (실제 비밀번호 값은 출력되지 않습니다):
   - `✓ ms20812 (홍길동) 생성: <uuid>` — 신규
   - `↻ ms20812 (홍길동) 리셋: <uuid>` — 이미 존재 → 초기 비번/플래그 복구(재테스트용)
   - `0002` 트리거가 `profiles` 행을 `must_change_password = true` 로 자동 생성합니다.

> 스크립트는 **재실행 안전**합니다. 다시 돌리면 기존 계정의 비밀번호가 사번으로,
> `must_change_password` 가 `true` 로 리셋되어 변경 흐름을 재검증할 수 있습니다.

## 로그인 & 비밀번호 변경 흐름

1. `/login` 에서 사번 + 초기 비밀번호(사번) 입력
2. `must_change_password = true` → `/change-password` 로 자동 이동
3. 새 비밀번호(8자 이상, 사번과 다름) 설정 → 저장
   - Supabase Auth 비밀번호 갱신 + `profiles.must_change_password = false`
4. `/dashboard` 접근 가능. 이후 **초기 비번 로그인 불가**, 새 비번으로만 로그인.

## 보안 메모

- 초기 비밀번호는 **앱 전용**이며 실제 회사 계정 비밀번호와 무관합니다.
- `email_confirm: true`(admin 생성) / `updateUser`(비번 변경)는 **메일을 발송하지 않으므로**
  실제 메일함으로 가는 메일이 없습니다.
- `service-role` 키와 `scripts/accounts.json` 은 프론트/깃에 노출하지 않습니다.
