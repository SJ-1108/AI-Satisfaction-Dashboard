import type { Satisfaction } from "@/lib/types";

/**
 * 더미 평가 데이터 (단계 1 — Supabase 실연동 전 임시 소스).
 * 실연동 시 이 모듈 대신 satisfaction 테이블 조회로 교체한다.
 *
 * reason 코드는 PRD 예시(insufficient) + 가정 코드들. 라벨 매핑은 lib/reasons.ts.
 */
export const DUMMY_SATISFACTION: Satisfaction[] = [
  { search_event_id: "ev-0001", query: "연말정산 환급 일정", summary_text: "연말정산 환급은 보통 신고 후 한 달 내 지급됩니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-01T09:12:00+09:00", synced_at: "2026-06-02T03:00:00+09:00" },
  { search_event_id: "ev-0002", query: "수능 등급컷 예측", summary_text: "올해 수능 등급컷은 영역별로 상이합니다.", rating: "down", reason: "insufficient", comment: "구체적인 점수가 없어요", created_at: "2026-06-01T10:40:00+09:00", synced_at: "2026-06-02T03:00:00+09:00" },
  { search_event_id: "ev-0003", query: "토익 접수 기간", summary_text: "이번 회차 토익 접수는 6월 둘째 주입니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-02T11:05:00+09:00", synced_at: "2026-06-03T03:00:00+09:00" },
  { search_event_id: "ev-0004", query: "공무원 시험 일정", summary_text: "지방직 공무원 시험은 6월 중순 예정입니다.", rating: "down", reason: "outdated", comment: "작년 일정 같아요", created_at: "2026-06-02T14:22:00+09:00", synced_at: "2026-06-03T03:00:00+09:00" },
  { search_event_id: "ev-0005", query: "대학 편입 자격", summary_text: "편입 자격은 2년제 졸업 이상이 일반적입니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-03T08:51:00+09:00", synced_at: "2026-06-04T03:00:00+09:00" },
  { search_event_id: "ev-0006", query: "수시 자기소개서 분량", summary_text: "자기소개서 분량은 대학마다 다릅니다.", rating: "down", reason: "irrelevant", comment: "질문이랑 다른 답이에요", created_at: "2026-06-03T16:30:00+09:00", synced_at: "2026-06-04T03:00:00+09:00" },
  { search_event_id: "ev-0007", query: "장학금 신청 방법", summary_text: "국가장학금은 한국장학재단에서 신청합니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-04T09:00:00+09:00", synced_at: "2026-06-05T03:00:00+09:00" },
  { search_event_id: "ev-0008", query: "편입 영어 난이도", summary_text: "편입 영어는 대학별 출제 경향이 다릅니다.", rating: "down", reason: "incorrect", comment: "정보가 틀렸습니다", created_at: "2026-06-04T13:45:00+09:00", synced_at: "2026-06-05T03:00:00+09:00" },
  { search_event_id: "ev-0009", query: "고등학교 내신 산출", summary_text: "내신은 과목별 석차등급으로 산출됩니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-05T10:10:00+09:00", synced_at: "2026-06-06T03:00:00+09:00" },
  { search_event_id: "ev-0010", query: "재수 종합반 비용", summary_text: "재수 종합반 비용은 학원과 지역에 따라 다릅니다.", rating: "down", reason: "insufficient", comment: "대략적인 금액이라도 필요해요", created_at: "2026-06-05T18:20:00+09:00", synced_at: "2026-06-06T03:00:00+09:00" },
  { search_event_id: "ev-0011", query: "논술 전형 일정", summary_text: "논술 전형은 수능 이후 진행되는 경우가 많습니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-06T09:35:00+09:00", synced_at: "2026-06-07T03:00:00+09:00" },
  { search_event_id: "ev-0012", query: "검정고시 응시 자격", summary_text: "검정고시는 만 나이 기준 응시 자격이 있습니다.", rating: "down", reason: "insufficient", comment: null, created_at: "2026-06-06T15:00:00+09:00", synced_at: "2026-06-07T03:00:00+09:00" },
  { search_event_id: "ev-0013", query: "수능 D-100 공부법", summary_text: "남은 기간 약점 과목 위주 학습이 효과적입니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-07T11:25:00+09:00", synced_at: "2026-06-08T03:00:00+09:00" },
  { search_event_id: "ev-0014", query: "대학 기숙사 비용", summary_text: "기숙사 비용은 학교별로 상이합니다.", rating: "down", reason: "irrelevant", comment: "엉뚱한 학교 정보예요", created_at: "2026-06-07T19:40:00+09:00", synced_at: "2026-06-08T03:00:00+09:00" },
  { search_event_id: "ev-0015", query: "학생부 종합전형", summary_text: "학종은 비교과와 교과를 종합 평가합니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-08T08:15:00+09:00", synced_at: "2026-06-09T03:00:00+09:00" },
  { search_event_id: "ev-0016", query: "토플 점수 환산", summary_text: "토플 점수 환산표는 기관마다 다릅니다.", rating: "down", reason: "incorrect", comment: "환산표가 잘못됨", created_at: "2026-06-08T17:05:00+09:00", synced_at: "2026-06-09T03:00:00+09:00" },
  { search_event_id: "ev-0017", query: "수능 원서 접수", summary_text: "수능 원서 접수는 8월 하순입니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-09T10:50:00+09:00", synced_at: "2026-06-10T03:00:00+09:00" },
  { search_event_id: "ev-0018", query: "내신 등급 비율", summary_text: "1등급은 상위 4% 이내입니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-09T13:30:00+09:00", synced_at: "2026-06-10T03:00:00+09:00" },
  { search_event_id: "ev-0019", query: "편입 면접 준비", summary_text: "면접은 전공 기초와 인성 질문이 주를 이룹니다.", rating: "down", reason: "outdated", comment: "예전 방식 안내", created_at: "2026-06-10T09:20:00+09:00", synced_at: "2026-06-11T03:00:00+09:00" },
  { search_event_id: "ev-0020", query: "대학 등록금 분할", summary_text: "등록금 분할 납부는 대부분 대학에서 가능합니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-10T16:10:00+09:00", synced_at: "2026-06-11T03:00:00+09:00" },
  { search_event_id: "ev-0021", query: "수능 선택과목 조합", summary_text: "선택과목은 지망 계열에 맞춰 정하는 것이 좋습니다.", rating: "down", reason: "insufficient", comment: "조합 예시가 부족", created_at: "2026-06-11T11:00:00+09:00", synced_at: "2026-06-12T03:00:00+09:00" },
  { search_event_id: "ev-0022", query: "정시 지원 전략", summary_text: "정시는 백분위와 표준점수를 함께 고려합니다.", rating: "up", reason: null, comment: null, created_at: "2026-06-11T14:55:00+09:00", synced_at: "2026-06-12T03:00:00+09:00" },
  { search_event_id: "ev-0023", query: "어학연수 비용", summary_text: "어학연수 비용은 국가와 기간에 따라 크게 다릅니다.", rating: "down", reason: "irrelevant", comment: null, created_at: "2026-06-12T09:45:00+09:00", synced_at: "2026-06-13T03:00:00+09:00" },
  { search_event_id: "ev-0024", query: "대학 학과 추천", summary_text: "관심 분야와 적성을 함께 고려해 선택하세요.", rating: "up", reason: null, comment: null, created_at: "2026-06-12T18:30:00+09:00", synced_at: "2026-06-13T03:00:00+09:00" },
];
