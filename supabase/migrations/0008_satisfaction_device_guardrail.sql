-- ----------------------------------------------------------------------------
-- 0008: satisfaction 에 업로드 엑셀 추가 컬럼 2종 추가.
--   * Device Type    → device_type     (기기 종류)
--   * Guardrail Label → guardrail_label (가드레일)
--   nullable text. 값이 없거나 비면 null. 고정 목록/CHECK 제약은 두지 않는다
--   (reason·cause_category 등 기존 라벨/코드 컬럼과 동일 방식).
--   record_key(중복 방지 해시) 구성에는 포함하지 않으므로, 동일 행 재업로드 시
--   기존 row 가 update 되어 이 두 컬럼 값만 보강된다(신규 row·feedback 영향 없음).
-- ----------------------------------------------------------------------------

alter table public.satisfaction
  add column if not exists device_type text,      -- 기기 종류
  add column if not exists guardrail_label text;   -- 가드레일

-- PostgREST 스키마 캐시 리로드(신규 컬럼 즉시 인식)
notify pgrst, 'reload schema';
