# 만족도 평가 대시보드 (Satisfaction Feedback Dashboard)

통합검색 AI 요약 응답에 대한 만족도 평가(👍/👎)를 조회·분석하고, 불만족 건에
대한 내부 피드백(원인·조치)을 기록·공유하는 사내 전용 웹 대시보드입니다.

- 프론트/배포: **Next.js (App Router) + Vercel**
- 백엔드/DB/인증: **Supabase (Postgres + Auth + RLS)**
- 소스: **Metabase** (단계 4 자동 동기화 대상)
- 사용자: 고정 5인, 외부 비공개, 사번 로그인

> 상세 요구사항은 PRD(`AI 만족도 평가 대시보드 PRD_v1.0_260623.docx`) 참조.

## 구현 단계

| 단계 | 내용 | 상태 |
|------|------|------|
| 0 | 기반: 스캐폴딩 · DB 스키마/RLS · 사번 로그인 · 5인 시드 | ✅ 완료 |
| 1 | 데이터: 수동 업로드(CSV/XLSX) · 원본 조회(메뉴 ②) | ⬜ |
| 2 | 대시보드(메뉴 ①): 통계 · 차트 · 날짜 필터 | ⬜ |
| 3 | 불만족 관리(메뉴 ③): 피드백 CRUD · 상태 워크플로 | ⬜ |
| 4 | 자동화: Vercel Cron + Metabase 동기화 | ⬜ |

## 로컬 실행

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 설정 (실제 Supabase 키 필요)
cp .env.local.example .env.local   # 값 채우기

# 3) DB 스키마 적용
#    Supabase SQL Editor 에 supabase/migrations/0001_init.sql 실행

# 4) 5인 계정 시드 (supabase/seed/seed_accounts.md 참조)
node --env-file=.env.local scripts/seed-accounts.mjs

# 5) 개발 서버
npm run dev   # http://localhost:3000
```

> ⚠️ 아직 Supabase 프로젝트가 없다면 로그인/조회는 동작하지 않습니다.
> 코드/스키마 검증은 `npm run typecheck`, `npm run build` 로 가능합니다.

## 디렉터리 구조

```
app/
  login/                  로그인 (사번+비밀번호)
  (app)/                  인증 영역 셸 + 3개 메뉴
    dashboard/            ① 대시보드 (FR-2)
    records/              ② 메타베이스 데이터 조회 (FR-3)
    feedback/             ③ 불만족 관리 (FR-4)
components/               공용 UI (sidebar, sign-out)
lib/
  supabase/client.ts      브라우저(anon) 클라이언트
  supabase/server.ts      서버(anon+쿠키) 클라이언트
  supabase/admin.ts       서버 전용(service-role) 클라이언트
  supabase/middleware.ts  세션 갱신 + 접근 통제
  empno.ts                사번↔이메일 내부 변환
  types.ts                DB 타입
  reasons.ts              reason 코드↔라벨 (미확정)
supabase/
  migrations/0001_init.sql  테이블·인덱스·RLS·트리거
  seed/seed_accounts.md     5인 계정 시드 절차
scripts/seed-accounts.mjs   시드 스크립트
middleware.ts               라우트 가드
```

## 보안 메모 (NFR-2)

- `SUPABASE_SERVICE_ROLE_KEY`, `METABASE_API_KEY` 는 **서버 환경변수에만** 둡니다.
- 프론트는 `NEXT_PUBLIC_SUPABASE_ANON_KEY` + RLS 만 사용합니다.
- `.env.local`, `scripts/accounts.json` 은 커밋되지 않습니다.
