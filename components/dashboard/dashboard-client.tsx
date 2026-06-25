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
} from "chart.js";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import type { Satisfaction } from "@/lib/types";
import {
  computeKpis,
  computeReasonBreakdown,
  computeTrend,
  dataDateRange,
  filterByDate,
  type Granularity,
} from "@/lib/data/dashboard-stats";

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

const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

/** 메뉴 ① 대시보드 (FR-2) — 누적 데이터(DB 또는 더미) 기준. */
export default function DashboardClient({
  records,
}: {
  records: Satisfaction[];
}) {
  const range = useMemo(() => dataDateRange(records), [records]);

  // Chart.js 는 브라우저 캔버스가 필요하므로, 클라이언트 mount 후에만 렌더한다.
  // (SSR 하이드레이션 불일치 방지 — canvas 가 클라이언트 DOM 에 확실히 mount됨)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [from, setFrom] = useState(range?.min ?? "");
  const [to, setTo] = useState(range?.max ?? "");

  const filtered = useMemo(
    () => filterByDate(records, from || undefined, to || undefined),
    [records, from, to],
  );

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const trend = useMemo(
    () => computeTrend(filtered, granularity),
    [filtered, granularity],
  );
  const reasons = useMemo(
    () => computeReasonBreakdown(filtered),
    [filtered],
  );

  const hasData = filtered.length > 0;

  const trendData = {
    labels: trend.map((t) => t.label),
    datasets: [
      {
        label: "만족(👍)",
        data: trend.map((t) => t.up),
        borderColor: UP_COLOR,
        backgroundColor: UP_COLOR,
        tension: 0.3,
      },
      {
        label: "불만족(👎)",
        data: trend.map((t) => t.down),
        borderColor: DOWN_COLOR,
        backgroundColor: DOWN_COLOR,
        tension: 0.3,
      },
    ],
  };

  const ratingData = {
    labels: ["만족(👍)", "불만족(👎)"],
    datasets: [
      {
        data: [kpis.up, kpis.down],
        backgroundColor: [UP_COLOR, DOWN_COLOR],
      },
    ],
  };

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

  function resetRange() {
    setFrom(range?.min ?? "");
    setTo(range?.max ?? "");
    setGranularity("day");
  }

  return (
    <div>
      <h1 className="page-title">① 대시보드</h1>
      <p className="page-desc">
        총 데이터 수 · 구분값별 · 불만족 세부 사유별 통계 · 날짜 필터 — 누적 데이터 기준
      </p>

      {/* 날짜 필터 (FR-2.4) */}
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
              min={range?.min}
              max={range?.max}
              onChange={(e) => setFrom(e.target.value)}
            />
            ~
            <input
              type="date"
              className="input"
              value={to}
              min={range?.min}
              max={range?.max}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="btn-ghost" onClick={resetRange}>
            기간 초기화
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="card placeholder">선택한 기간에 데이터가 없습니다.</div>
      ) : (
        <>
          {/* KPI 카드 (FR-2.1) */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">총 평가수</div>
              <div className="kpi-value">{kpis.total.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">만족 👍</div>
              <div className="kpi-value up">{kpis.up.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">불만족 👎</div>
              <div className="kpi-value down">{kpis.down.toLocaleString()}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">만족률</div>
              <div className="kpi-value">{kpis.rate}%</div>
            </div>
          </div>

          {/* 차트 (FR-2.2 / FR-2.5) */}
          <div className="chart-grid">
            <div className="card chart-box wide">
              <div className="chart-title">평가 추이 (FR-2.2)</div>
              <div className="chart-canvas">
                {mounted ? (
                  <Line
                    data={trendData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                      },
                    }}
                  />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
                )}
              </div>
            </div>

            <div className="card chart-box">
              <div className="chart-title">만족/불만족 분포 (FR-2.2)</div>
              <div className="chart-canvas">
                {mounted ? (
                  <Doughnut
                    data={ratingData}
                    options={{ responsive: true, maintainAspectRatio: false }}
                  />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
                )}
              </div>
            </div>
          </div>

          {/* 불만족 사유별 (FR-2.3) */}
          <div className="card chart-box">
            <div className="chart-title">불만족 세부 사유별 (FR-2.3)</div>
            {reasons.length === 0 ? (
              <p className="placeholder">불만족 평가가 없습니다.</p>
            ) : (
              <div className="chart-canvas tall">
                {mounted ? (
                  <Bar
                    data={reasonData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: "y" as const,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { beginAtZero: true, ticks: { precision: 0 } },
                      },
                    }}
                  />
                ) : (
                  <div className="chart-loading">차트 로딩 중…</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
