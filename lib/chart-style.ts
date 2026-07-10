import { Chart as ChartJS } from "chart.js";

/**
 * 대시보드·불만족 관리 탭 차트 공통 스타일 (Chart.js / canvas).
 *
 * Chart.js 는 SVG 가 아닌 canvas 로 렌더한다. 100% 배율에서 텍스트·선이
 * 흐릿/거칠어 보이던 주원인은 두 가지였다.
 *   1) 연한 회색 텍스트(#8a909c) + 얇은 폰트(400) + 작은 크기(11px)
 *   2) 표준 해상도(devicePixelRatio 1) 래스터
 * → 텍스트 색을 한 단계 진한 slate 로, 폰트를 12px/500 으로 통일하고,
 *   devicePixelRatio 를 올려 고해상도로 그린다.
 * 색상 팔레트·데이터 계산·비율 로직은 이 파일에서 다루지 않는다(변경 없음).
 */

/**
 * 축 tick·범례 텍스트 색 — slate-500.
 * 기존(#8a909c, 연함)과 1차 개선(#475569, 다소 진함)의 중간값.
 * 테이블 본문(#5a616e~#6b7280)보다 과하게 진하지 않게 맞춘다.
 * (선명도는 이 색 + weight 로만 확보하고 fontSize 는 각 차트의 기존 값을 유지)
 */
export const CHART_TEXT_COLOR = "#64748b";
/** 공통 폰트 두께 — 기존 400 → 500(400~500 범위). fontSize 는 키우지 않는다. */
export const CHART_FONT_WEIGHT = 500;
/** grid 라인 색 — 기존 수준의 연한 회색(텍스트보다 옅게). */
export const CHART_GRID_COLOR = "#f0f2f5";

/** grid 공통 스타일 — 텍스트 색과 분리 관리 */
export const CHART_GRID = { color: CHART_GRID_COLOR } as const;

/**
 * 라인 차트 공통 렌더 속성 — 선/포인트 선명도.
 * dataset 마다 색상(borderColor 등)은 그대로 두고 spread 로 덮는다.
 */
export const COMMON_LINE_PROPS = {
  borderWidth: 2.5, // 얇지 않되 과하지 않게 (기존 2.5 유지)
  borderCapStyle: "round" as const, // strokeLinecap="round" 상당 — 유지
  borderJoinStyle: "round" as const, // strokeLinejoin="round" 상당 — 유지
  tension: 0.4,
  // dot 은 기존과 동일한 solid 컬러 점(radius 3). 흰 테두리(point border)를
  // 넣으면 컬러 영역이 가려져 점이 작아 보이므로 넣지 않는다.
  pointRadius: 3,
  pointHoverRadius: 5, // activeDot — 기본(4)보다 살짝 크게 유지
};

/**
 * 도넛 차트 공통 렌더 속성 — 조각 경계.
 * dataset 마다 backgroundColor(색)는 그대로 두고 spread 로 덮는다.
 */
export const COMMON_PIE_PROPS = {
  // 흰 경계 2px + 기본 정렬(center). borderAlign:"inner" 는 인접 조각의 색을
  // 맞닿게 해 경계가 오히려 뭉개져 보이므로 사용하지 않는다(기본값 유지).
  // radius/cutout 은 각 옵션에서 정수 px 로 고정(115/90, 130/105) → 경계 안정.
  borderWidth: 2,
  borderColor: "#fff",
  hoverOffset: 6,
};

/**
 * Chart.js 전역 기본값 — 폰트/색/해상도.
 * 두 탭에서 mount 후(useEffect) 동일하게 호출한다.
 * (devicePixelRatio 는 window 접근이라 클라이언트에서만 유효)
 */
export function applyChartDefaults() {
  ChartJS.defaults.color = CHART_TEXT_COLOR;
  // fontSize 는 전역에서 강제하지 않는다(Chart.js 기본 12 유지) — 각 차트의
  // 기존 크기(일부 11)를 그대로 두고, 선명도는 색/두께로만 확보.
  ChartJS.defaults.font.weight = CHART_FONT_WEIGHT;
  // 캔버스를 고해상도로 래스터 → 100% 배율에서도 텍스트·선·조각 경계 선명.
  ChartJS.defaults.devicePixelRatio = Math.max(3, window.devicePixelRatio || 1);
}
