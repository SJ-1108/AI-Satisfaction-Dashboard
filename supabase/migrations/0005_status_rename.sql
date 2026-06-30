-- ----------------------------------------------------------------------------
-- 0005: 불만족 관리 진행 상태 '조치완료' → '처리완료' 명칭 변경.
--   * status CHECK 제약을 새 값으로 교체하고, 기존 데이터를 일괄 갱신한다.
--   * 제약을 먼저 해제한 뒤 데이터를 갱신하고, 새 제약을 다시 건다.
-- ----------------------------------------------------------------------------

alter table public.feedback drop constraint if exists feedback_status_check;

update public.feedback set status = '처리완료' where status = '조치완료';

alter table public.feedback
  add constraint feedback_status_check
  check (status in ('미확인', '검토중', '처리완료', '보류'));
