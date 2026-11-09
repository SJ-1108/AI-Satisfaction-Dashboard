-- ============================================================================
-- 0010_feedback_auto_judgement.sql — 자동 판정 피드백 표시 컬럼
-- 목적:
--   업로드 파일에 피드백 컬럼(원인 분류·유관 부서·처리 상태·피드백 내용·메모·단계·확신도)이
--   함께 들어오면 적재 시 feedback 행을 같이 만든다. 그 행이 자동 판정으로 생긴 것인지,
--   담당자가 아직 확인하지 않은 2단 건인지 구분하기 위한 컬럼 3개를 추가한다.
--
--   * auto_tier       : '1단'(자동 확정) / '2단'(담당자 확인 필요) / null(사람이 직접 작성)
--   * auto_confidence : 판정 확신도 0~1 (참고용)
--   * needs_review    : 2단 건은 true 로 들어오고, 담당자가 모달에서 저장하면 false 로 바뀐다
--
-- 주의:
--   * 기존 행은 auto_tier null · needs_review false 로 유지된다(사람 기록).
--   * 적재 시 기존 feedback 이 이미 사람 손을 탄 건(원인 분류·피드백 내용·상태 중 하나라도 입력)
--     은 덮어쓰지 않는다 — 앱(appendSatisfactionRows)에서 보장.
-- (0007 적용 후 실행. 재실행 안전)
-- ============================================================================

alter table public.feedback
  add column if not exists auto_tier text
    check (auto_tier is null or auto_tier in ('1단', '2단'));

alter table public.feedback
  add column if not exists auto_confidence numeric(3, 2)
    check (auto_confidence is null or (auto_confidence >= 0 and auto_confidence <= 1));

alter table public.feedback
  add column if not exists needs_review boolean not null default false;

create index if not exists idx_feedback_needs_review
  on public.feedback (needs_review) where needs_review;
