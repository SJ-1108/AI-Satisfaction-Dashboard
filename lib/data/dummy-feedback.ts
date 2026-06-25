import type { Feedback } from "@/lib/types";

/**
 * 더미 피드백 데이터 (Supabase 미설정 시 화면 검토용).
 * 실연동 시 이 모듈 대신 feedback 테이블 조회로 교체한다.
 *
 * - satisfaction_id 는 DUMMY_SATISFACTION 의 down(불만족) 건 id 와 1:1 매칭.
 * - 여기에 없는 down 건은 아직 피드백이 없는 상태(가상 "미확인")로 취급한다
 *   (lib/data/feedback-view.ts 의 buildFeedbackRows 참고).
 * - created_by / updated_by 는 작성자 사번(더미). 실연동 시 auth.uid()→사번 변환.
 */
export const DUMMY_FEEDBACK: Feedback[] = [
  {
    id: "fb-0002",
    satisfaction_id: "s-0002",
    status: "검토중",
    detail_reason: "등급컷 구체 점수 데이터 누락",
    cause_category: "데이터 부족",
    action: "등급컷 점수 소스 연동 검토 중",
    memo: "올해 회차 데이터 입수 후 재학습 필요",
    created_by: "ms20812",
    updated_by: "ms20812",
    created_at: "2026-06-02T09:00:00+09:00",
    updated_at: "2026-06-03T10:00:00+09:00",
  },
  {
    id: "fb-0008",
    satisfaction_id: "s-0008",
    status: "조치완료",
    detail_reason: "편입 영어 난이도 정보 오류",
    cause_category: "오답/사실 오류",
    action: "출처 교정 및 프롬프트 가이드 반영 완료",
    memo: "유사 질의 재현 테스트 통과",
    created_by: "ms20812",
    updated_by: "ms20813",
    created_at: "2026-06-05T09:30:00+09:00",
    updated_at: "2026-06-06T14:20:00+09:00",
  },
  {
    id: "fb-0016",
    satisfaction_id: "s-0016",
    status: "보류",
    detail_reason: "토플 환산표 부정확",
    cause_category: "오답/사실 오류",
    action: null,
    memo: "공식 환산표 기관별 상이 — 정책 확정 대기",
    created_by: "ms20813",
    updated_by: "ms20813",
    created_at: "2026-06-09T09:10:00+09:00",
    updated_at: "2026-06-09T09:10:00+09:00",
  },
];
