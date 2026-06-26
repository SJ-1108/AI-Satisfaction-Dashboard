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

// 부드러운 톤: 만족=파랑 계열, 불만족=빨강 계열 (강한 원색 지양)
const UP_COLOR = "#60a5fa"; // soft blue
const DOWN_COLOR = "#f87171"; // soft red

/** 상태별 누적 막대 색상 (차분한 톤, 상태 구분은 명확하게) */
const STATUS_COLOR: Record<FeedbackStatus, string> = {
  미확인: "#cbd5e1", // slate (연한 회색)
  검토중: "#818cf8", // indigo (부드러운 블루/인디고)
  조치완료: "#34d399", // emerald (부드러운 그린)
  보류: "#fbbf24", // amber (부드러운 앰버)
};

/** N건 (xx.x%) 비율 문자열 */
function pct(value: number, total: number): string {
  if (!total) return "0.0%";
  return `${(Math.round((value / total) * 1000) / 10).toFixed(1)}%`;
}

/** 메뉴 ① 대시보드 (FR-2) — 누적 데이터(DB 또는 더미) 기준. */
export default function DashboardClient({
  records,
  feedback,
}: {
  records: Satisfaction[];
  feedback: Feedback[];
}) {
  const range = useMemo(() => dataDateRange(records), [records]);

  // 기본 노출 기간: 데이터 최신일(KST, 필터 전 전체 created_at 최대) 포함 최근 7일.
  // 시작 = 최신일-6, 종료 = 최신일. 데이터가 없으면 조회 당일(KST) 기준으로 폴백.
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

  // 시작일이 종료일보다 미래면 잘못된 조합 → 필터 적용 차단 + 안내
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

  const hasRecords = records.length > 0; // 업로드 데이터 존재 여부 (KPI 표시 기준)
  const hasData = filtered.length > 0; // 선택 기간 내 데이터 존재 여부 (그래프 기준)
  const reasonTotal = reasons.reduce((s, r) => s + r.count, 0);

  // ── 추이 (line) ──
  const trendData = {
    labels: trend.map((t) => t.label),
    datasets: [
      {
        label: "만족 👍",
        data: trend.map((t) => t.up),
        borderColor: UP_COLOR,
        backgroundColor: UP_COLOR,
        tension: 0.3,
      },
      {
        label: "불만족 👎",
        data: trend.map((t) => t.down),
        borderColor: DOWN_COLOR,
        backgroundColor: DOWN_COLOR,
        tension: 0.3,
      },
    ],
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { precision: 0 as const } } },
    plugins: {
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
  };

  // ── 비중 (doughnut) ──
  const ratingData = {
    labels: ["만족 👍", "불만족 👎"],
    datasets: [
      {
        data: [kpis.up, kpis.down],
        backgroundColor: [UP_COLOR, DOWN_COLOR],
      },
    ],
  };

  const ratingTotal = kpis.up + kpis.down;
  const ratingOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"doughnut">) => {
            const v = ctx.parsed;
            return `${ctx.label}: ${v}건 (${pct(v, ratingTotal)})`;
          },
        },
      },
    },
  };

  // ── 신규: 일자별 상태 누적 막대 ──
  const dailyData = {
    labels: daily.map((d) => d.date),
    datasets: FEEDBACK_STATUSES.map((s) => ({
      label: s,
      data: daily.map((d) => d.status[s]),
      backgroundColor: STATUS_COLOR[s],
      stack: "status",
    })),
  };

  const dailyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 as const } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          // 총평가·불만족(률)을 상태 항목들보다 위에 먼저 표시
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
  };

  // ── 사유별 분포 (가로 막대) ──
  const reasonData = {
    labels: reasons.map((r) => r.label),
    datasets: [
      {
        label: "불만족 건수",
        data: reasons.map((r) => r.count),
        backgroundColor: DOWN_COLOR,
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
    scales: { x: { beginAtZero: true, ticks: { precision: 0 as const } } },
  };

  function resetRange() {
    setFrom(defaultRange.from);
    setTo(defaultRange.to);
    setGranularity("day");
  }

  return (
    <div>
      <h1 className="page-title">① 현황 대시보드</h1>
      <p className="page-desc">
        핵심 지표 · 만족도 추이/비중 · 일자별 불만족·피드백 처리 현황 · 사유별 분포 — 누적 데이터 기준
      </p>

      {!hasRecords ? (
        <div className="card placeholder">업로드된 데이터가 없습니다.</div>
      ) : (
        <>
          {/* 1) 전체 누적 현황 — 기간 필터와 무관하게 전체 데이터 기준 (고정) */}
          <div className="section-head">
            전체 누적 현황
            <span className="section-note">전체 업로드 데이터 기준</span>
          </div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">총 평가수</div>
              <div className="kpi-value">{allKpis.total.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">만족 👍</div>
              <div className="kpi-value up">{allKpis.up.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">불만족 👎</div>
              <div className="kpi-value down">{allKpis.down.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">만족률</div>
              <div className="kpi-value">{allKpis.rate}%</div>
            </div>
          </div>

          {/* 2) 그래프 조회 기간 — 하단 그래프/테이블에만 적용 */}
          <div className="section-head">그래프 조회 기간</div>
          <div className="toolbar card">
            <div className="toolbar-row">
              <div className="seg">
                {(["day", "week", "month"] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    className={`seg-btn${granularity === g ? " active" : ""}`}
                    onClick={() => setGranularity(g)}
                  >
                    {g === "day" ? "일" : g === "week" ? "주" : "월"}
                  </button>
                ))}
              </div>
              <label className="inline-label">
                기간
                <input
                  type="date"
                  className="input"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
                ~
                <input
                  type="date"
                  className="input"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              {dateRangeInvalid && (
                <span className="error-msg" style={{ margin: 0 }}>
                  시작일이 종료일보다 늦습니다 — 기간을 다시 선택하세요.
                </span>
              )}
              <button className="btn-ghost" onClick={resetRange}>
                기간 초기화
              </button>
            </div>
          </div>

          {/* 3) 기간 기준 그래프/테이블 영역 */}
          {!hasData ? (
            <div className="card placeholder">선택한 기간에 데이터가 없습니다.</div>
          ) : (
            <>
          {/* 추이 / 비중 */}
          <div className="chart-grid">
            <div className="card chart-box wide">
              <div className="chart-title">만족도 평가 추이</div>
              <div className="chart-canvas">
                {mounted ? (
                  <Line data={trendData} options={trendOptions} />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
                )}
              </div>
            </div>

            <div className="card chart-box">
              <div className="chart-title">만족/불만족 비중</div>
              <div className="chart-canvas">
                {mounted ? (
                  <Doughnut data={ratingData} options={ratingOptions} />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
                )}
              </div>
            </div>
          </div>

          {/* 4) 신규: 일자별 불만족 및 피드백 처리 현황 */}
          <div className="card chart-box">
            <div className="chart-title">일자별 불만족 및 피드백 처리 현황</div>
            {daily.length === 0 ? (
              <p className="placeholder">데이터가 없습니다.</p>
            ) : (
              <>
                <div className="chart-canvas">
                  {mounted ? (
                    <Bar data={dailyData} options={dailyOptions} />
                  ) : (
                    <div className="chart-loading">차트 로딩 중…</div>
                  )}
                </div>
                <div className="table-scroll" style={{ marginTop: 16 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>총 평가</th>
                        <th>불만족</th>
                        <th>불만족률</th>
                        <th>미확인</th>
                        <th>검토중</th>
                        <th>조치완료</th>
                        <th>보류</th>
                        <th>처리완료율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((d) => (
                        <tr key={d.date}>
                          <td className="nowrap">{d.date}</td>
                          <td>{d.total}</td>
                          <td>{d.down}</td>
                          <td>{d.downRate.toFixed(1)}%</td>
                          <td>{d.status["미확인"]}</td>
                          <td>{d.status["검토중"]}</td>
                          <td>{d.status["조치완료"]}</td>
                          <td>{d.status["보류"]}</td>
                          <td>
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
          <div className="card chart-box">
            <div className="chart-title">불만족 사유별 분포</div>
            {reasons.length === 0 ? (
              <p className="placeholder">불만족 평가가 없습니다.</p>
            ) : (
              <div className="chart-canvas tall">
                {mounted ? (
                  <Bar data={reasonData} options={reasonOptions} />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
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
