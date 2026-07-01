-- ----------------------------------------------------------------------------
-- 0006: 불만족 피드백에 '유관 부서'(related_department) 컬럼 추가.
--   * nullable text. 고정 목록은 UI(드롭다운)에서만 강제하므로 CHECK 제약은 두지 않는다
--     (현행 cause_category 도 free text 이며 동일 방식).
-- ----------------------------------------------------------------------------

alter table public.feedback add column related_department text; -- 유관 부서
