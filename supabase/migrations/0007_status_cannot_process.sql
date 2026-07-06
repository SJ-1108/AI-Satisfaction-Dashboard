-- ----------------------------------------------------------------------------
-- 0007: 처리 상태에 '처리 불가' 추가 + 원인 분류(cause_category) 라벨 정비.
--   1) feedback.status CHECK 제약에 '처리 불가' 추가.
--      (인라인 CHECK 자동 생성 제약명 = feedback_status_check. 배포 환경에서
--       제약명이 다르면 \d feedback 로 확인 후 교체할 것.)
--   2) 원인 분류 이름 변경에 맞춰 기존 free-text 값 일괄 UPDATE
--      ('데이터 부족' → '데이터 부족·보완', '오답·사실 오류' → '사실 오류').
--      cause_category 는 CHECK 제약이 없으므로 데이터만 갱신하면 된다.
-- ----------------------------------------------------------------------------

alter table public.feedback drop constraint feedback_status_check;
alter table public.feedback add constraint feedback_status_check
  check (status in ('미확인', '검토중', '조치완료', '보류', '처리 불가'));

update public.feedback set cause_category = '데이터 부족·보완'
  where cause_category = '데이터 부족';
update public.feedback set cause_category = '사실 오류'
  where cause_category = '오답·사실 오류';
