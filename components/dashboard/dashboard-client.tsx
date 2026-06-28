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
import type { Feedback, FeedbackStatus, Satisfaction } from "@/lib/types";
import { FEEDBACK_STATUSES } from "@/lib/types";
import {
  computeDailyFeedbackStatus,
  computeKpis,
  computeReasonBreakdown,
  computeTrend,
  dataDateRange,
  filterByDate,
  type Granularity,
} from "@/lib/data/dashboard-stats";
import { isDateRangeInvalid, kstDatePart } from "@/lib/format-date";
import DateRangePicker from "@/components/ui/date-range-picker";

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
ChartJS.defaults.font.family = "Pretendard, -apple-system, sans-serif";
ChartJS.defaults.color = "#8a909c";

// 디자인 팔레트
const BLUE = "#2f6bff"; // 만족
const RED = "#f06b66"; // 불만족 (차트)
const DISSAT = "#e0635d"; // 불만족 (KPI/표 강조)

/** 상태별 누적 막대 색상 (디자인 기준) */
const STATUS_COLOR: Record<FeedbackStatus, string> = {
  미확인: "#d5d9e0",
  검토중: "#7c83f5",
  조치완료: "#10b981",
  보류: "#f5b73d",
};

const GRID = { color: "#f0f2f5" } as const;
const LEGEND_TOP = {
  display: true,
  position: "top" as const,
  align: "end" as const,
  labels: { boxWidth: 12, boxHeight: 12, padding: 16, font: { size: 12 } },
};

/** N건 (xx.x%) 비율 문자열 */
function pct(value: number, total: number): string {
  if (!total) return "0.0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1)}%`;
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
const resetBtnStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Pretendard, sans-serif",
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
  useEffect(() => setMounted(true), []);

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
  const daily = useMemo(
    () => computeDailyFeedbackStatus(filtered, feedback),
    [filtered, feedback],
  );

  const hasRecords = records.length > 0; // 업로드 데이터 존재 여부
  const hasData = filtered.length > 0; // 선택 기간 내 데이터 존재 여부
  const reasonTotal = reasons.reduce((s, r) => s + r.count, 0);

  // ── 추이 (line) ──
  const trendData = {
    labels: trend.map((t) => t.label),
    datasets: [
      {
        label: "만족 👍",
        data: trend.map((t) => t.up),
        borderColor: BLUE,
        backgroundColor: BLUE,
        pointBackgroundColor: BLUE,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 3,
        fill: false,
      },
      {
        label: "불만족 👎",
        data: trend.map((t) => t.down),
        borderColor: RED,
        backgroundColor: RED,
        pointBackgroundColor: RED,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 3,
        fill: false,
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
        borderWidth: 4,
        borderColor: "#fff",
        hoverOffset: 6,
      },
    ],
  };

  const ratingTotal = kpis.up + kpis.down;
  const ratingOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "66%",
    plugins: {
      legend: LEGEND_TOP,
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
    labels: daily.map((d) => d.date),
    datasets: FEEDBACK_STATUSES.map((s) => ({
      label: s,
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
          label: (ctx: TooltipItem<"bar">) => {
            const v = ctx.parsed.x ?? 0;
            return `${ctx.label}: ${v}건 (${pct(v, reasonTotal)})`;
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, grid: GRID, ticks: { precision: 0 as const } },
      y: { grid: { display: false }, ticks: { font: { size: 12 } } },
    },
  };

  function resetRange() {
    setFrom(defaultRange.from);
    setTo(defaultRange.to);
    setGranularity("day");
  }

  const stats = [
    { label: "총 평가수", value: allKpis.total.toLocaleString(), color: "#1a1d23" },
    { label: "만족 👍", value: allKpis.up.toLocaleString(), color: BLUE },
    { label: "불만족 👎", value: allKpis.down.toLocaleString(), color: DISSAT },
    { label: "만족률", value: `${allKpis.rate}%`, color: "#1a1d23" },
  ];

  return (
    <div style={{ maxWidth: 1280 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 40 }}>
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
              <div key={s.label} style={{ ...cardStyle, padding: "20px 22px" }}>
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
            <div style={{ ...sectionTitle, marginRight: "auto" }}>
              기간별 만족도 평가 조회
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
                    onClick={() => setGranularity(g)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      padding: "7px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "Pretendard, sans-serif",
                      borderRadius: 7,
                      color: active ? "#fff" : "#6b7280",
                      background: active ? BLUE : "transparent",
                      boxShadow: active
                        ? "0 1px 2px rgba(47,107,255,.3)"
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
              {/* 추이 / 비중 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.7fr 1fr",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div style={{ ...cardStyle, padding: "20px 22px" }}>
                  <div style={chartTitle}>만족도 평가 추이</div>
                  <div style={{ height: 300, position: "relative" }}>
                    {mounted ? (
                      <Line data={trendData} options={trendOptions} />
                    ) : (
                      <ChartLoading />
                    )}
                  </div>
                </div>

                <div style={{ ...cardStyle, padding: "20px 22px" }}>
                  <div style={chartTitle}>만족/불만족 비중</div>
                  <div style={{ height: 300, position: "relative" }}>
                    {mounted ? (
                      <Doughnut data={ratingData} options={ratingOptions} />
                    ) : (
                      <ChartLoading />
                    )}
                  </div>
                </div>
              </div>

              {/* 4) 일자별 불만족 평가 처리 현황 */}
              <div style={{ ...cardStyle, padding: "22px 24px", marginBottom: 24 }}>
                <div style={chartTitle}>일자별 불만족 평가 처리 현황</div>
                {daily.length === 0 ? (
                  <p style={{ color: "#8a909c" }}>데이터가 없습니다.</p>
                ) : (
                  <>
                    <div
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
                            <th style={th}>날짜</th>
                            <th style={th}>총 평가</th>
                            <th style={th}>불만족</th>
                            <th style={th}>불만족률</th>
                            <th style={th}>미확인</th>
                            <th style={th}>검토중</th>
                            <th style={th}>조치완료</th>
                            <th style={th}>보류</th>
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
                                {d.date}
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
                              <td style={{ ...td, color: "#4d82ff" }}>
                                {d.status["미확인"]}
                              </td>
                              <td style={td}>{d.status["검토중"]}</td>
                              <td style={td}>{d.status["조치완료"]}</td>
                              <td style={td}>{d.status["보류"]}</td>
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

              {/* 5) 불만족 사유별 분포 */}
              <div style={{ ...cardStyle, padding: "22px 24px" }}>
                <div style={chartTitle}>불만족 사유별 분포</div>
                {reasons.length === 0 ? (
                  <p style={{ color: "#8a909c" }}>불만족 평가가 없습니다.</p>
                ) : (
                  <div style={{ height: 300, position: "relative" }}>
                    {mounted ? (
                      <Bar data={reasonData} options={reasonOptions} />
                    ) : (
                      <ChartLoading />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
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
