"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  type TooltipItem,
  type TooltipPositionerFunction,
  type ChartType,
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import type { Feedback, Satisfaction } from "@/lib/types";
import { FEEDBACK_STATUSES, STATUS_COLOR, statusLabel } from "@/lib/types";
import { CAUSE_CHART_COLORS, CAUSE_FALLBACK_COLOR } from "@/lib/cause-categories";
import { departmentColor } from "@/lib/departments";
import {
  computeCauseBreakdown,
  computeDailyFeedbackStatus,
  computeDepartmentBreakdown,
  computeKpis,
  computeReasonBreakdown,
  computeTrend,
  dataDateRange,
  filterByDate,
  formatBucketLabel,
  type Granularity,
} from "@/lib/data/dashboard-stats";
import { isDateRangeInvalid, kstDatePart } from "@/lib/format-date";
import { useChartPdfExport } from "@/lib/use-chart-pdf-export";
import { valueLabelsPlugin } from "@/lib/chart-value-labels";
import DateRangePicker from "@/components/ui/date-range-picker";
import {
  applyChartDefaults,
  CHART_GRID,
  CHART_TEXT_COLOR,
  COMMON_LINE_PROPS,
  COMMON_PIE_PROPS,
} from "@/lib/chart-style";

// Chart.js 모듈 등록 (한 번만)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  // PDF/인쇄 스냅샷에서만 막대·선차트 값을 그리는 플러그인(평소엔 비활성).
  valueLabelsPlugin,
);

// 가로 막대 툴팁을 커서 위치에 고정 — 막대 길이에 따라 좌/우로 흔들리는 기본(막대 중심)
// 앵커 동작 방지. (짧은 막대는 중심이 왼쪽이라 툴팁이 왼쪽에 뜨던 현상 해소)
declare module "chart.js" {
  interface TooltipPositionerMap {
    cursor: TooltipPositionerFunction<ChartType>;
  }
}
Tooltip.positioners.cursor = function (_items, eventPosition) {
  return { x: eventPosition.x, y: eventPosition.y };
};

// 차트 공통 기본값 (Pretendard, 디자인 톤)
ChartJS.defaults.font.family =
  "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
// 텍스트 색/크기/두께는 공통 스타일(applyChartDefaults, mount 후)로 통일한다.
ChartJS.defaults.color = CHART_TEXT_COLOR;
// 애니메이션 비활성화 — 인쇄(beforeprint) 시 resize()가 캔버스를 '동기적으로'
// 다시 그리도록 하기 위함. 애니메이션이 켜져 있으면 그리기가 rAF로 지연되어
// 인쇄 스냅샷에 리사이즈 결과가 반영되지 않는다. (프로토타입과 동일)
ChartJS.defaults.animation = false;

// 디자인 팔레트
const BLUE = "#2450c8"; // 만족 (딥 블루)
const RED = "#e8635d"; // 불만족 (추이·비중·사유별 분포 차트)
const DISSAT = "#e0635d"; // 불만족 (KPI/표 강조)

/**
 * 도넛 차트 기하 구조 — 비중·원인 분류 도넛 공용.
 * 반지름/안쪽 지름을 px로 고정해 두 차트의 링 두께를 동일하게 유지한다.
 * (cutout을 %로 두면 컨테이너·범례 크기에 따라 반지름이 달라져 두께가 어긋난다.)
 */
const DONUT_RADIUS = 115; // 바깥 반지름(px)
const DONUT_CUTOUT = 90; // 안쪽 반지름(px) → 링 두께 = 25px

const GRID = CHART_GRID;
// 범례는 모두 canvas 대신 HTML(ChartLegend)로 그린다 — canvas 텍스트는 ClearType
// 서브픽셀 힌팅을 못 써 DOM 텍스트보다 물렁하게 보이므로, 범례를 HTML로 빼
// 일반 텍스트와 동일한 선명도로 맞춘다. 각 차트 options 의 legend 는 display:false.

/** N건 (xx.x%) 비율 문자열 */
function pct(value: number, total: number): string {
  if (!total) return "0.0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1)}%`;
}

/**
 * 세그먼트(일/주/월) → 조회 기간 자동 산출. anchor(데이터 최신일, YYYY-MM-DD) 기준.
 * - day: 최근 7일 (anchor-6 ~ anchor)
 * - week: 최근 4주 (금~차주 목요일 주 경계 정렬 — anchor 포함 주의 금요일에서 3주 전 ~ anchor)
 * - month: 최근 1년 (anchor 달-11개월 1일 ~ anchor)
 */
function rangeForGranularity(
  g: Granularity,
  anchor: string,
): { from: string; to: string } {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (g === "week") {
    // 금요일 시작(금~차주 목요일) 주 경계에 맞춰 최근 4주.
    const dow = (d.getUTCDay() + 2) % 7; // 0=금
    d.setUTCDate(d.getUTCDate() - dow - 21);
  } else if (g === "month") d.setUTCMonth(d.getUTCMonth() - 11, 1);
  else d.setUTCDate(d.getUTCDate() - 6);
  return { from: d.toISOString().slice(0, 10), to: anchor };
}

// ── 인라인 스타일 (디자인 수치 재현) ──
const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eceef1",
  borderRadius: 14,
  boxShadow: "0 1px 2px rgba(16,24,40,.03)",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: "-0.3px",
};
const chartTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 4,
  letterSpacing: "-0.3px",
};
// PDF 내보내기 버튼 (헤더 우측) — design_handoff_pdf_export 명세 수치
const exportBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  color: "#5a616e",
  background: "#fff",
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  cursor: "pointer",
};
const resetBtnStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  color: "#2f6bff",
  background: "#fff",
  border: "1px solid #2f6bff",
  borderRadius: 9,
  cursor: "pointer",
};
const th: React.CSSProperties = {
  padding: "12px 14px",
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #edeff2",
  textAlign: "center",
};
const td: React.CSSProperties = {
  padding: "13px 14px",
  textAlign: "center",
  color: "#6b7280",
};

/** 메뉴 ① 대시보드 (FR-2) — 누적 데이터(DB 또는 더미) 기준. */
export default function DashboardClient({
  records,
  feedback,
}: {
  records: Satisfaction[];
  feedback: Feedback[];
}) {
  const range = useMemo(() => dataDateRange(records), [records]);

  // 기본 노출 기간: 데이터 최신일(KST) 포함 최근 7일. 데이터 없으면 조회 당일 기준.
  const defaultRange = useMemo(() => {
    const anchor = range?.max ?? kstDatePart(new Date().toISOString());
    const d = new Date(`${anchor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: anchor };
  }, [range]);

  // Chart.js 는 브라우저 캔버스가 필요하므로, 클라이언트 mount 후에만 렌더한다.
  const [mounted, setMounted] = useState(false);
  // 캔버스 렌더 해상도 배율 — arc·라인 곡선의 계단현상(앨리어싱)을 줄이려 실제
  // devicePixelRatio 의 2배로 슈퍼샘플링한다(정수 2:1 다운샘플 → 곡선 매끈 + 직선 선명).
  // SSR 엔 window 가 없으므로 2 로 두고, 클라이언트 첫 렌더의 lazy initializer 에서
  // 확정한다(차트는 mount 후에만 렌더 → 하이드레이션 불일치 없음).
  const [superDpr] = useState(() =>
    typeof window !== "undefined" ? 2 * (window.devicePixelRatio || 1) : 2,
  );
  useEffect(() => {
    // 공통 차트 기본값(폰트·색) 적용.
    applyChartDefaults();
    setMounted(true);
  }, []);

  // PDF 내보내기(인쇄) — 차트 스냅샷 + A4 리플로우 공용 훅. 차트 컨테이너에는
  // className="pdf-chart-box" 를 지정한다. (zoom 미사용 이유는 훅 주석 참조)
  const { exportPdf } = useChartPdfExport();

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  // 시작일이 종료일보다 미래면 잘못된 조합 → 필터 적용 차단
  const dateRangeInvalid = isDateRangeInvalid(from, to);

  const filtered = useMemo(
    () =>
      dateRangeInvalid
        ? records
        : filterByDate(records, from || undefined, to || undefined),
    [records, from, to, dateRangeInvalid],
  );

  // KPI 카드는 기간 필터와 무관하게 전체 업로드 데이터 누적 기준으로 고정.
  const allKpis = useMemo(() => computeKpis(records), [records]);
  // 비중(도넛)은 그래프 영역이므로 기간 필터 적용분(filtered) 기준 유지.
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const trend = useMemo(
    () => computeTrend(filtered, granularity),
    [filtered, granularity],
  );
  const reasons = useMemo(() => computeReasonBreakdown(filtered), [filtered]);
  const causes = useMemo(
    () => computeCauseBreakdown(filtered, feedback),
    [filtered, feedback],
  );
  const daily = useMemo(
    () => computeDailyFeedbackStatus(filtered, feedback, granularity),
    [filtered, feedback, granularity],
  );
  // 유관 부서별 협의 필요 비중 — 기간 필터 적용분(filtered) 기준 (처리 현황과 동일 기준).
  const departments = useMemo(
    () => computeDepartmentBreakdown(filtered, feedback),
    [filtered, feedback],
  );

  const hasRecords = records.length > 0; // 업로드 데이터 존재 여부
  const hasData = filtered.length > 0; // 선택 기간 내 데이터 존재 여부
  const reasonTotal = reasons.reduce((s, r) => s + r.count, 0);
  const causeTotal = causes.reduce((s, c) => s + c.count, 0);
  const deptTotal = departments.reduce((s, d) => s + d.count, 0);

  // ── 추이 (line) ──
  const trendData = {
    labels: trend.map((t) => formatBucketLabel(t.label, granularity)),
    datasets: [
      {
        label: "만족 👍",
        data: trend.map((t) => t.up),
        borderColor: BLUE,
        backgroundColor: BLUE,
        pointBackgroundColor: BLUE,
        fill: false,
        ...COMMON_LINE_PROPS,
      },
      {
        label: "불만족 👎",
        data: trend.map((t) => t.down),
        borderColor: RED,
        backgroundColor: RED,
        pointBackgroundColor: RED,
        fill: false,
        ...COMMON_LINE_PROPS,
      },
    ],
  };

  const trendOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"line">) => {
            const b = trend[ctx.dataIndex];
            const bucketTotal = b ? b.up + b.down : 0;
            const v = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${v}건 (${pct(v, bucketTotal)})`;
          },
        },
      },
    },
    scales: {
      y: { beginAtZero: true, grid: GRID, ticks: { precision: 0 as const } },
      x: { grid: { display: false }, ticks: { font: { size: 13 } } },
    },
  };

  // ── 비중 (doughnut) ──
  const ratingData = {
    labels: ["만족 👍", "불만족 👎"],
    datasets: [
      {
        data: [kpis.up, kpis.down],
        backgroundColor: [BLUE, RED],
        // 원인 분류 도넛과 링 두께를 맞추기 위해 흰 테두리 공통(COMMON_PIE_PROPS)
        ...COMMON_PIE_PROPS,
      },
    ],
  };

  const ratingTotal = kpis.up + kpis.down;
  const ratingOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // 기본 title(범례명 중복)을 비워 2줄로
          title: () => "",
          // 색상칩을 테두리 없는 단색으로 (조각의 흰 테두리에 묻히지 않게)
          labelColor: (ctx: TooltipItem<"doughnut">) => {
            const bg = (ctx.dataset.backgroundColor as string[])[ctx.dataIndex];
            return {
              borderColor: bg,
              backgroundColor: bg,
              borderWidth: 0,
              borderRadius: 3,
            };
          },
          label: (ctx: TooltipItem<"doughnut">) => {
            const v = ctx.parsed;
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${pct(v, ratingTotal)})`];
          },
        },
      },
    },
  };

  // ── 일자별 상태 누적 막대 ──
  const dailyData = {
    labels: daily.map((d) => formatBucketLabel(d.date, granularity)),
    datasets: FEEDBACK_STATUSES.map((s) => ({
      label: statusLabel(s),
      data: daily.map((d) => d.status[s]),
      backgroundColor: STATUS_COLOR[s],
      borderRadius: 4,
      maxBarThickness: 56,
      stack: "status",
    })),
  };

  const dailyOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          beforeBody: (items: TooltipItem<"bar">[]) => {
            const row = daily[items[0]?.dataIndex ?? 0];
            if (!row) return [];
            return [
              `총 평가수: ${row.total}건`,
              `불만족: ${row.down}건 (${row.downRate.toFixed(1)}%)`,
            ];
          },
          label: (ctx: TooltipItem<"bar">) =>
            `${ctx.dataset.label}: ${ctx.parsed.y}건`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 13 } } },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: GRID,
        ticks: { precision: 0 as const },
      },
    },
  };

  // ── 사유별 분포 (가로 막대) ──
  const reasonData = {
    labels: reasons.map((r) => r.label),
    datasets: [
      {
        label: "불만족 건수",
        data: reasons.map((r) => r.count),
        backgroundColor: RED,
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  };

  const reasonOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        position: "cursor" as const,
        callbacks: {
          // 기본 title(범례명 중복) 제거 → 2줄
          title: () => "",
          // 색상칩을 테두리 없는 단색으로
          labelColor: (ctx: TooltipItem<"bar">) => {
            const bg = ctx.dataset.backgroundColor as string;
            return {
              borderColor: bg,
              backgroundColor: bg,
              borderWidth: 0,
              borderRadius: 3,
            };
          },
          label: (ctx: TooltipItem<"bar">) => {
            const v = ctx.parsed.x ?? 0;
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${pct(v, reasonTotal)})`];
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, grid: GRID, ticks: { precision: 0 as const } },
      // 불만족 사유 라벨 — 크기는 기존(12), 선명도는 전역 색(#64748b)/두께로 확보
      y: { grid: { display: false }, ticks: { font: { size: 13 } } },
    },
  };

  // ── 원인 분류별 통계 (도넛) ──
  const causeData = {
    labels: causes.map((c) => c.category),
    datasets: [
      {
        data: causes.map((c) => c.count),
        backgroundColor: causes.map(
          (c) => CAUSE_CHART_COLORS[c.category] ?? CAUSE_FALLBACK_COLOR,
        ),
        // 작은 조각도 경계가 또렷하도록 공통 도넛 속성 적용
        ...COMMON_PIE_PROPS,
      },
    ],
  };

  const causeOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: () => "",
          labelColor: (ctx: TooltipItem<"doughnut">) => {
            const bg = (ctx.dataset.backgroundColor as string[])[ctx.dataIndex];
            return {
              borderColor: bg,
              backgroundColor: bg,
              borderWidth: 0,
              borderRadius: 3,
            };
          },
          label: (ctx: TooltipItem<"doughnut">) => {
            const v = ctx.parsed;
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${pct(v, causeTotal)})`];
          },
        },
      },
    },
  };

  // ── 유관 부서별 협의 필요 비중 (가로 막대, 건수 내림차순) ──
  const deptRanked = [...departments].sort((a, b) => b.count - a.count);
  const deptData = {
    labels: deptRanked.map((d) => d.department),
    datasets: [
      {
        label: "협의 필요 건수",
        data: deptRanked.map((d) => d.count),
        backgroundColor: deptRanked.map((_, i) => departmentColor(i)),
        borderRadius: 4,
        maxBarThickness: 44,
      },
    ],
  };

  const deptOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        position: "cursor" as const,
        callbacks: {
          title: () => "",
          labelColor: (ctx: TooltipItem<"bar">) => {
            const bg = (ctx.dataset.backgroundColor as string[])[ctx.dataIndex];
            return {
              borderColor: bg,
              backgroundColor: bg,
              borderWidth: 0,
              borderRadius: 3,
            };
          },
          label: (ctx: TooltipItem<"bar">) => {
            const v = ctx.parsed.x ?? 0;
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${pct(v, deptTotal)})`];
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, grid: GRID, ticks: { precision: 0 as const } },
      y: { grid: { display: false }, ticks: { font: { size: 13 } } },
    },
  };

  // 세그먼트(일/주/월) 선택 → granularity + 조회 기간 자동 연동
  function applyGranularity(g: Granularity) {
    const anchor = range?.max ?? kstDatePart(new Date().toISOString());
    const r = rangeForGranularity(g, anchor);
    setGranularity(g);
    setFrom(r.from);
    setTo(r.to);
  }

  function resetRange() {
    applyGranularity("day");
  }

  // 차트 범례 항목 — HTML(ChartLegend)로 렌더. 색은 각 차트 dataset 색과 일치시킨다.
  // 추이 선차트 범례(값 없음) — 시계열이라 단일 건수로 요약할 수 없다.
  const ratingLegend = [
    { label: "만족 👍", color: BLUE },
    { label: "불만족 👎", color: RED },
  ];
  // 비중 도넛 범례 — 각 조각 건수·비율을 함께 표기(도넛은 화면·PDF 모두 값 노출).
  const ratingDonutLegend = [
    { label: "만족 👍", color: BLUE, count: kpis.up, total: ratingTotal },
    { label: "불만족 👎", color: RED, count: kpis.down, total: ratingTotal },
  ];
  const statusLegend = FEEDBACK_STATUSES.map((s) => ({
    label: statusLabel(s),
    color: STATUS_COLOR[s],
  }));
  // 원인 분류 도넛 범례 — 각 분류 건수·비율을 함께 표기.
  const causeLegend = causes.map((c) => ({
    label: c.category,
    color: CAUSE_CHART_COLORS[c.category] ?? CAUSE_FALLBACK_COLOR,
    count: c.count,
    total: causeTotal,
  }));

  const stats = [
    { label: "총 평가수", value: allKpis.total.toLocaleString(), color: "#1a1d23" },
    { label: "만족 👍", value: allKpis.up.toLocaleString(), color: BLUE },
    { label: "불만족 👎", value: allKpis.down.toLocaleString(), color: DISSAT },
    { label: "만족률", value: `${allKpis.rate}%`, color: "#1a1d23" },
  ];

  return (
    <div className="dashboard pdf-report">
      {/* 헤더 — 좌측 타이틀 / 우측 PDF 내보내기 버튼 */}
      <div
        style={{
          marginBottom: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.5px",
          }}
        >
          대시보드
        </h1>
        <button
          type="button"
          style={exportBtnStyle}
          onClick={() => void exportPdf()}
          title="대시보드를 PDF로 내보내기 (인쇄 대화상자에서 'PDF로 저장' 선택)"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5a616e"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          PDF 내보내기
        </button>
      </div>

      {!hasRecords ? (
        <div style={{ ...cardStyle, padding: "40px 24px", color: "#8a909c" }}>
          업로드된 데이터가 없습니다.
        </div>
      ) : (
        <>
          {/* 1) 전체 누적 현황 */}
          <div style={{ ...sectionTitle, marginBottom: 12 }}>전체 누적 현황</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="card-block"
                style={{ ...cardStyle, padding: "20px 22px" }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "#8a909c",
                    marginBottom: 12,
                    fontWeight: 500,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: "-1px",
                    color: s.color,
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* 기간별 만족도 평가 조회 — 회색 패널로 그룹화(누적 현황과 시각적 구분) */}
          <div
            style={{
              background: "#f7f5f1",
              border: "1px solid #ece7de",
              borderRadius: 14,
              padding: "20px 22px",
            }}
          >
            {/* 2) 조회 툴바 */}
            <div
              style={{
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
            <div
              style={{
                marginRight: "auto",
                display: "flex",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <div style={sectionTitle}>기간별 만족도 평가 조회</div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
                총 평가{" "}
                <b style={{ color: BLUE, fontWeight: 700 }}>
                  {kpis.total.toLocaleString()}
                </b>
                건
              </div>
            </div>

            {/* 일/주/월 세그먼트 */}
            <div
              style={{
                display: "inline-flex",
                background: "#fff",
                border: "1px solid #e2e5ea",
                borderRadius: 9,
                padding: 3,
              }}
            >
              {(["day", "week", "month"] as Granularity[]).map((g) => {
                const active = granularity === g;
                return (
                  <button
                    key={g}
                    onClick={() => applyGranularity(g)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      padding: "7px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                      borderRadius: 7,
                      color: active ? "#fff" : "#6b7280",
                      background: active ? BLUE : "transparent",
                      boxShadow: active
                        ? "0 1px 2px rgba(36,80,200,.3)"
                        : "none",
                      transition: "all .12s",
                    }}
                  >
                    {g === "day" ? "일" : g === "week" ? "주" : "월"}
                  </button>
                );
              })}
            </div>

            {/* 날짜 범위 (달력 팝오버) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
                기간
              </span>
              <DateRangePicker
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
              />
            </div>

            <button style={resetBtnStyle} onClick={resetRange}>
              기간 초기화
            </button>
          </div>

          {/* 3) 기간 기준 그래프/표 */}
          {!hasData ? (
            <div style={{ ...cardStyle, padding: "40px 24px", color: "#8a909c" }}>
              선택한 기간에 데이터가 없습니다.
            </div>
          ) : (
            <>
              {/* ① 전체 현황 — 추이(추세) + 만족/불만족 비중(개요) */}
              <div
                className="pdf-subhead"
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#3a4150",
                  letterSpacing: "-0.3px",
                  margin: "4px 0 14px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#3a4150",
                    marginRight: 8,
                  }}
                />
                전체 현황
              </div>
              <div
                className="pdf-chart-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 28,
                }}
              >
                <div
                  className="card-block"
                  style={{
                    ...cardStyle,
                    padding: "20px 22px",
                    minWidth: 0,
                    gridColumn: "span 3",
                  }}
                >
                  <div style={chartTitle}>만족도 평가 추이</div>
                  {mounted && (
                    <ChartLegend
                      items={ratingLegend}
                      align="end"
                      style={{ marginBottom: 10 }}
                    />
                  )}
                  <div className="pdf-chart-box" style={{ height: 300, position: "relative" }}>
                    {mounted ? (
                      <Line data={trendData} options={trendOptions} />
                    ) : (
                      <ChartLoading />
                    )}
                  </div>
                </div>

                <div
                  className="card-block"
                  style={{
                    ...cardStyle,
                    padding: "20px 22px",
                    minWidth: 0,
                    gridColumn: "span 1",
                  }}
                >
                  <div style={chartTitle}>만족/불만족 비중</div>
                  <div className="pdf-donut-wrap">
                    <div className="pdf-chart-box" style={{ height: 300, position: "relative" }}>
                      {mounted ? (
                        <Doughnut data={ratingData} options={ratingOptions} />
                      ) : (
                        <ChartLoading />
                      )}
                    </div>
                    {mounted && (
                      <ChartLegend items={ratingDonutLegend} style={{ marginTop: 12 }} />
                    )}
                  </div>
                </div>
              </div>

              {/* ② 불만족 원인 분석 — 사유(무엇을) + 원인 분류(왜) */}
              <div
                className="pdf-subhead"
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#3a4150",
                  letterSpacing: "-0.3px",
                  margin: "4px 0 14px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#3a4150",
                    marginRight: 8,
                  }}
                />
                불만족 원인 분석
              </div>
              <div
                className="pdf-chart-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 28,
                }}
              >
                <div
                  className="card-block"
                  style={{
                    ...cardStyle,
                    padding: "22px 24px",
                    minWidth: 0,
                    gridColumn: "span 3",
                  }}
                >
                  <div style={chartTitle}>불만족 사유별 분포</div>
                  {reasons.length === 0 ? (
                    <p style={{ color: "#8a909c" }}>불만족 평가가 없습니다.</p>
                  ) : (
                    <div className="pdf-chart-box" style={{ height: 360, position: "relative" }}>
                      {mounted ? (
                        <Bar data={reasonData} options={reasonOptions} />
                      ) : (
                        <ChartLoading />
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="card-block"
                  style={{
                    ...cardStyle,
                    padding: "20px 22px",
                    minWidth: 0,
                    gridColumn: "span 1",
                  }}
                >
                  <div style={chartTitle}>원인 분류별 통계</div>
                  {causes.length === 0 ? (
                    <p style={{ color: "#8a909c" }}>불만족 평가가 없습니다.</p>
                  ) : (
                    <div className="pdf-donut-wrap">
                      <div className="pdf-chart-box" style={{ height: 300, position: "relative" }}>
                        {mounted ? (
                          <Doughnut data={causeData} options={causeOptions} />
                        ) : (
                          <ChartLoading />
                        )}
                      </div>
                      {mounted && (
                        <ChartLegend items={causeLegend} style={{ marginTop: 12 }} />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ③ 대응 현황 — 처리 현황(진행) + 유관 부서(협의 대상) */}
              <div
                className="pdf-subhead"
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#3a4150",
                  letterSpacing: "-0.3px",
                  margin: "4px 0 14px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#3a4150",
                    marginRight: 8,
                  }}
                />
                대응 현황
              </div>
              <div
                className="card-block"
                style={{ ...cardStyle, padding: "22px 24px", marginBottom: 24 }}
              >
                <div style={chartTitle}>불만족 평가 처리 현황</div>
                {daily.length === 0 ? (
                  <p style={{ color: "#8a909c" }}>데이터가 없습니다.</p>
                ) : (
                  <>
                    {/* 범례+막대차트를 한 덩어리로 묶어 인쇄 시 페이지 중간에서 갈라지지 않게 */}
                    <div style={{ breakInside: "avoid" }}>
                      {mounted && (
                        <ChartLegend
                          items={statusLegend}
                          align="end"
                          style={{ marginBottom: 10 }}
                        />
                      )}
                      <div
                        className="pdf-chart-box"
                        style={{
                          height: 300,
                          position: "relative",
                          marginBottom: 20,
                        }}
                      >
                        {mounted ? (
                          <Bar data={dailyData} options={dailyOptions} />
                        ) : (
                          <ChartLoading />
                        )}
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 13,
                          minWidth: 760,
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#f7f8fa" }}>
                            <th style={th}>
                              {granularity === "day" ? "날짜" : "기간"}
                            </th>
                            <th style={th}>총 평가</th>
                            <th style={th}>불만족</th>
                            <th style={th}>불만족률</th>
                            <th style={th}>미확인</th>
                            <th style={th}>검토중</th>
                            <th style={th}>처리완료</th>
                            <th style={th}>보류</th>
                            <th style={th}>처리 불가</th>
                            <th style={th}>처리완료율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {daily.map((d) => (
                            <tr
                              key={d.date}
                              style={{ borderBottom: "1px solid #f1f3f5" }}
                            >
                              <td
                                style={{
                                  padding: "13px 14px",
                                  fontWeight: 500,
                                  color: "#3a4150",
                                  whiteSpace: "nowrap",
                                  textAlign: "center",
                                }}
                              >
                                {formatBucketLabel(d.date, granularity)}
                              </td>
                              <td style={{ ...td, color: "#3a4150" }}>{d.total}</td>
                              <td
                                style={{
                                  ...td,
                                  fontWeight: 600,
                                  color: DISSAT,
                                }}
                              >
                                {d.down}
                              </td>
                              <td style={td}>{d.downRate.toFixed(1)}%</td>
                              <td style={{ ...td, color: BLUE }}>
                                {d.status["미확인"]}
                              </td>
                              <td style={td}>{d.status["검토중"]}</td>
                              <td style={td}>{d.status["조치완료"]}</td>
                              <td style={td}>{d.status["보류"]}</td>
                              <td style={td}>{d.status["처리 불가"]}</td>
                              <td style={td}>
                                {d.handledRate === null
                                  ? "-"
                                  : `${d.handledRate.toFixed(1)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                </div>

                <div
                  className="card-block"
                  style={{ ...cardStyle, padding: "22px 24px" }}
                >
                  <div style={chartTitle}>유관 부서별 협의 필요 비중</div>
                  {departments.length === 0 ? (
                    <p style={{ color: "#8a909c" }}>협의가 필요한 부서가 없습니다.</p>
                  ) : (
                    <div
                      className="pdf-chart-box"
                      style={{
                        // 전체 폭이라 가로:세로 비율이 넓어 인쇄에서 낮게 찌그러지므로,
                        // 높이를 넉넉히(부서 수 비례) 잡아 인쇄 시에도 충분한 높이 확보.
                        height: Math.max(300, departments.length * 60),
                        position: "relative",
                      }}
                    >
                      {mounted ? (
                        <Bar data={deptData} options={deptOptions} />
                      ) : (
                        <ChartLoading />
                      )}
                    </div>
                  )}
                </div>
            </>
          )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 차트 범례 — canvas 가 아닌 HTML(DOM)로 렌더한다. canvas 텍스트는 그레이스케일
 * AA 만 적용돼 Windows ClearType 힌팅을 못 써 물렁하게 보이므로, 범례를 HTML로
 * 빼 일반 텍스트와 동일한 선명도로 맞춘다. (색칩은 각 dataset 색과 일치)
 */
function ChartLegend({
  items,
  align = "center",
  style,
}: {
  items: { label: string; color: string; count?: number; total?: number }[];
  align?: "start" | "center" | "end";
  style?: React.CSSProperties;
}) {
  const justify =
    align === "end" ? "flex-end" : align === "start" ? "flex-start" : "center";
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 16px",
        justifyContent: justify,
        ...style,
      }}
    >
      {items.map((it) => (
        <li
          key={it.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 500,
            color: CHART_TEXT_COLOR,
          }}
        >
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background: it.color,
              flexShrink: 0,
            }}
          />
          {it.label}
          {it.count != null && (
            <span style={{ marginLeft: 6, color: "#98a0ad", fontWeight: 500 }}>
              {it.count.toLocaleString()}건
              {it.total != null && `(${pct(it.count, it.total)})`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 차트 mount 전 로딩 표시 */
function ChartLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#8a909c",
        fontSize: 13,
      }}
    >
      차트 로딩 중…
    </div>
  );
}
