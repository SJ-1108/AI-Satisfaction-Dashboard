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
);

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
// 라인/도넛 범례 칩을 동일한 사각형(같은 크기)으로 통일
const LEGEND_LABELS = {
  usePointStyle: true,
  pointStyle: "rect" as const,
  boxWidth: 12,
  boxHeight: 12,
  padding: 14,
  font: { size: 12 },
};
const LEGEND_TOP = {
  display: true,
  position: "top" as const,
  align: "end" as const,
  labels: LEGEND_LABELS,
};
// 비중(도넛) — 범례 중앙 하단
const LEGEND_BOTTOM = {
  display: true,
  position: "bottom" as const,
  align: "center" as const,
  labels: LEGEND_LABELS,
};

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
  useEffect(() => {
    // 공통 차트 기본값(폰트·색·고해상도 래스터) 적용 — 화면/인쇄 모두 선명하게.
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
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: LEGEND_TOP,
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
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
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
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      legend: LEGEND_BOTTOM,
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
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: LEGEND_TOP,
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
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
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
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
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
      y: { grid: { display: false }, ticks: { font: { size: 12 } } },
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
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      // 좁은 1/4 폭 카드 — 범례를 하단에 두어 도넛이 카드 폭을 온전히 쓰게 하고,
      // 항목 간격(padding)을 넉넉히 주어 쪼개져 보이지 않게 한다.
      legend: {
        display: true,
        position: "bottom" as const,
        align: "center" as const,
        labels: {
          usePointStyle: true,
          pointStyle: "rect" as const,
          boxWidth: 10,
          boxHeight: 10,
          padding: 12,
          font: { size: 11 },
        },
      },
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

  // ── 유관 부서별 협의 필요 비중 (도넛) ──
  const deptData = {
    labels: departments.map((d) => d.department),
    datasets: [
      {
        data: departments.map((d) => d.count),
        backgroundColor: departments.map((_, i) => departmentColor(i)),
        ...COMMON_PIE_PROPS,
      },
    ],
  };

  const deptOptions = {
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      // 좁은 1/4 폭 카드 — 원인 분류 도넛과 동일하게 범례 하단 배치.
      legend: {
        display: true,
        position: "bottom" as const,
        align: "center" as const,
        labels: {
          usePointStyle: true,
          pointStyle: "rect" as const,
          boxWidth: 10,
          boxHeight: 10,
          padding: 12,
          font: { size: 11 },
        },
      },
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
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${pct(v, deptTotal)})`];
          },
        },
      },
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
              {/* 추이 / 비중 — 상단 KPI 4열 그리드와 폭을 정렬
                  (추이=총평가수+만족+불만족 3열, 비중=만족률 1열) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 24,
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
                  <div className="pdf-chart-box" style={{ height: 300, position: "relative" }}>
                    {mounted ? (
                      <Doughnut data={ratingData} options={ratingOptions} />
                    ) : (
                      <ChartLoading />
                    )}
                  </div>
                </div>
              </div>

              {/* 4) 불만족 사유별 분포 + 원인 분류별 통계
                  (상단 추이·비중 행과 동일하게 3:1 4열 그리드로 정렬) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 24,
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
                    padding: "22px 24px",
                    minWidth: 0,
                    gridColumn: "span 1",
                  }}
                >
                  <div style={chartTitle}>원인 분류별 통계</div>
                  {causes.length === 0 ? (
                    <p style={{ color: "#8a909c" }}>불만족 평가가 없습니다.</p>
                  ) : (
                    <div className="pdf-chart-box" style={{ height: 360, position: "relative" }}>
                      {mounted ? (
                        <Doughnut data={causeData} options={causeOptions} />
                      ) : (
                        <ChartLoading />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 5) 불만족 평가 처리 현황 + 유관 부서별 협의 필요 비중(우측 도넛) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    ...cardStyle,
                    padding: "22px 24px",
                    minWidth: 0,
                    gridColumn: "span 3",
                  }}
                >
                <div style={chartTitle}>불만족 평가 처리 현황</div>
                {daily.length === 0 ? (
                  <p style={{ color: "#8a909c" }}>데이터가 없습니다.</p>
                ) : (
                  <>
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

                {/* 유관 부서별 협의 필요 비중 (처리 현황 카드 우측) */}
                <div
                  className="card-block"
                  style={{
                    ...cardStyle,
                    padding: "22px 24px",
                    minWidth: 0,
                    gridColumn: "span 1",
                  }}
                >
                  <div style={chartTitle}>유관 부서별 협의 필요 비중</div>
                  {departments.length === 0 ? (
                    <p style={{ color: "#8a909c" }}>협의가 필요한 부서가 없습니다.</p>
                  ) : (
                    <div
                      className="pdf-chart-box"
                      style={{ height: 360, position: "relative" }}
                    >
                      {mounted ? (
                        <Doughnut data={deptData} options={deptOptions} />
                      ) : (
                        <ChartLoading />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          </div>
        </>
      )}
    </div>
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
