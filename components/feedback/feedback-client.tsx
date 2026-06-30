"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildFeedbackRows,
  type FeedbackEdit,
  type FeedbackRow,
} from "@/lib/data/feedback-view";
import {
  countByCauseCategory,
  countByStatus,
  handledRate,
} from "@/lib/data/feedback-stats";
import { reasonLabel, REASON_OPTIONS } from "@/lib/reasons";
import {
  formatKstDateTime,
  kstDatePart,
  isDateRangeInvalid,
} from "@/lib/format-date";
import { exportRows, type ExportFormat } from "@/lib/export";
import {
  FEEDBACK_STATUSES,
  type Feedback,
  type FeedbackStatus,
  type Satisfaction,
} from "@/lib/types";
import { saveFeedback } from "@/app/(app)/feedback/actions";
import FeedbackDialog from "./feedback-dialog";
import Dropdown from "@/components/ui/dropdown";
import DateRangePicker from "@/components/ui/date-range-picker";
import Pager from "@/components/ui/pager";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family = "Pretendard, -apple-system, sans-serif";
ChartJS.defaults.color = "#8a909c";

const PAGE_SIZE = 10;

/** 원인 분류 도넛 색상 팔레트 (순환) */
const CAUSE_COLORS = [
  "#2f6bff",
  "#f06b66",
  "#10b981",
  "#f5b73d",
  "#7c83f5",
  "#22a565",
  "#e0635d",
  "#d5d9e0",
];

/** 상태별 색상 (디자인 톤) */
const STATUS_COLOR: Record<FeedbackStatus, string> = {
  미확인: "#6b7280",
  검토중: "#2f6bff",
  처리완료: "#1f9d6a",
  보류: "#d98a00",
};

/** 상태별 연한 배경(드롭다운 pill) */
const STATUS_BG: Record<FeedbackStatus, string> = {
  미확인: "#eef0f3",
  검토중: "#eaf1ff",
  처리완료: "#e3f3ec",
  보류: "#fbf0db",
};

// ── 공통 인라인 스타일 ──
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eceef1",
  borderRadius: 14,
  padding: "20px 22px",
  boxShadow: "0 1px 2px rgba(16,24,40,.03)",
};
const exportBtn: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Pretendard, sans-serif",
  color: "#5a616e",
  background: "#fff",
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  cursor: "pointer",
};
const outlineBtn: React.CSSProperties = {
  height: 42,
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Pretendard, sans-serif",
  color: "#2f6bff",
  background: "#fff",
  border: "1px solid #2f6bff",
  borderRadius: 10,
  cursor: "pointer",
};
const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  height: 42,
  padding: "0 14px",
  fontSize: 13,
  fontFamily: "Pretendard, sans-serif",
  color: "#1a1d23",
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  outline: "none",
};
const filterLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  fontWeight: 500,
};
const th: React.CSSProperties = {
  padding: "12px 14px",
  fontWeight: 600,
  color: "#6b7280",
  borderBottom: "1px solid #edeff2",
  textAlign: "center",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "center",
  color: "#3a4150",
};
/** 한 줄 노출 후 말줄임 (질의어·AI답변·의견) — 데이터 조회 표와 동일하게 컬럼이 섞여 보이지 않도록 단일 행 처리 */
const cellText: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * 메뉴 ③ 불만족 평가 관리 (FR-4) — 누적 데이터 기준.
 */
export default function FeedbackClient({
  currentUser,
  satisfaction,
  initialFeedback,
}: {
  currentUser: { empNo: string; name: string };
  satisfaction: Satisfaction[];
  initialFeedback: Feedback[];
  dbMode: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback[]>(initialFeedback);
  useEffect(() => setFeedback(initialFeedback), [initialFeedback]);

  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FeedbackRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Chart.js 는 브라우저 캔버스가 필요하므로 mount 후에만 렌더
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const allRows = useMemo(
    () => buildFeedbackRows(satisfaction, feedback),
    [satisfaction, feedback],
  );

  const statusCounts = useMemo(() => countByStatus(allRows), [allRows]);
  const causeCounts = useMemo(() => countByCauseCategory(allRows), [allRows]);
  const handled = useMemo(() => handledRate(allRows), [allRows]);

  // 최근 처리된 5건 (상태가 미확인이 아닌 건, updated_at 최신순)
  const recentHandled = useMemo(
    () =>
      allRows
        .filter((r) => r.status !== "미확인")
        .sort((a, b) => {
          const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
          const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
          return tb - ta;
        })
        .slice(0, 5),
    [allRows],
  );

  // 원인 분류 도넛
  const causeTotal = causeCounts.reduce((s, c) => s + c.count, 0);
  const causeChartData = {
    labels: causeCounts.map((c) => c.category),
    datasets: [
      {
        data: causeCounts.map((c) => c.count),
        backgroundColor: causeCounts.map(
          (_, i) => CAUSE_COLORS[i % CAUSE_COLORS.length],
        ),
        borderWidth: 1,
        borderColor: "#fff",
        hoverOffset: 6,
      },
    ],
  };
  const causeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "66%",
    plugins: {
      legend: {
        position: "right" as const,
        labels: { boxWidth: 12, boxHeight: 12, padding: 12, font: { size: 12 } },
      },
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
            const rate = causeTotal
              ? `${(Math.round((v / causeTotal) * 1000) / 10).toFixed(1)}%`
              : "0.0%";
            return [`${ctx.label}`, `${v.toLocaleString()}건 (${rate})`];
          },
        },
      },
    },
  };

  const dateRangeInvalid = isDateRangeInvalid(dateFrom, dateTo);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateRangeInvalid ? "" : dateFrom;
    const to = dateRangeInvalid ? "" : dateTo;
    return allRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      if (from && kstDatePart(r.created_at) < from) return false;
      if (to && kstDatePart(r.created_at) > to) return false;
      if (q) {
        if (!(r.query ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allRows, statusFilter, reasonFilter, search, dateFrom, dateTo, dateRangeInvalid]);

  function resetFilters() {
    setSearch("");
    setReasonFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function persist(edit: FeedbackEdit, successMsg: string) {
    setSaving(true);
    try {
      // 더미/실제 모드 모두 서버 액션으로 저장 → 새로고침으로 모든 메뉴에 반영
      const res = await saveFeedback(edit);
      if (!res.ok) {
        setToast(`저장 실패 — ${res.error ?? "알 수 없는 오류"}`);
        setTimeout(() => setToast(null), 5000);
        return false;
      }
      router.refresh();
      setToast(successMsg);
      setTimeout(() => setToast(null), 4000);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function onSave(edit: FeedbackEdit) {
    const ok = await persist(
      edit,
      `피드백 저장 완료 — No.${editing?.record_no ?? ""} (작성자 ${currentUser.empNo})`,
    );
    if (ok) setEditing(null);
  }

  /** 목록에서 상태만 빠르게 변경 (인라인). 기존 피드백 내용은 유지. */
  async function onQuickStatus(row: FeedbackRow, status: FeedbackStatus) {
    await persist(
      {
        satisfaction_id: row.satisfaction_id,
        status,
        detail_reason: row.detail_reason,
        cause_category: row.cause_category,
        action: row.action,
        memo: row.memo,
      },
      `상태 변경 — No.${row.record_no} → ${status}`,
    );
  }

  function onExport(format: ExportFormat) {
    const flat = filtered.map((r) => ({
      "No.": r.record_no,
      평가일시: kstDatePart(r.created_at),
      질의어: r.query ?? "",
      "평가 사유": r.reason ? reasonLabel(r.reason) : "",
      의견: r.comment ?? "",
      "처리 상태": r.status,
      "원인 분류": r.cause_category ?? "",
      "피드백 내용": r.action ?? "",
      담당자: r.updated_by ?? "",
      처리일: r.updated_at ? formatKstDateTime(r.updated_at) : "",
    }));
    exportRows(flat, `feedback_${new Date().toISOString().slice(0, 10)}`, format);
  }

  const reasonOptions = [
    { label: "전체", value: "all" },
    ...REASON_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  ];
  const statusOptions = [
    { label: "전체", value: "all" },
    ...FEEDBACK_STATUSES.map((s) => ({ label: s, value: s })),
  ];

  const kpis = [
    { label: "불만족 총건수", value: allRows.length, color: "#e0635d" },
    ...FEEDBACK_STATUSES.map((s) => ({
      label: s,
      value: statusCounts[s],
      color: STATUS_COLOR[s],
    })),
  ];

  return (
    <div>
      <h1
        style={{
          margin: "0 0 28px",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.5px",
        }}
      >
        불만족 평가 관리
      </h1>

      {toast && <div className="toast">{toast}</div>}

      {/* 통계 KPI 5개 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, padding: "18px 20px" }}>
            <div
              style={{
                fontSize: 13,
                color: "#8a909c",
                marginBottom: 10,
                fontWeight: 500,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.8px",
                color: k.color,
              }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* 원인 분류별 통계 / 처리 현황 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 3fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: "-0.3px" }}>
            원인 분류별 통계
          </div>
          {causeCounts.length === 0 ? (
            <p style={{ color: "#8a909c", fontSize: 13 }}>데이터가 없습니다.</p>
          ) : (
            <div style={{ height: 260, position: "relative" }}>
              {mounted ? (
                <Doughnut data={causeChartData} options={causeChartOptions} />
              ) : (
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
              )}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: "-0.3px" }}>
            처리 현황
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 13, color: "#8a909c" }}>
              미확인 외 상태로 처리된 비율
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-1px",
                color: "#1a1d23",
              }}
            >
              {handled}%
            </span>
          </div>

          {/* 최근 처리 5건 */}
          {recentHandled.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9aa1ad", margin: 0 }}>
              처리된 건이 없습니다.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "48%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f7f8fa" }}>
                  <th style={{ ...th, padding: "9px 12px" }}>상태</th>
                  <th style={{ ...th, padding: "9px 12px" }}>원인 분류</th>
                  <th style={{ ...th, padding: "9px 12px" }}>피드백 내용</th>
                </tr>
              </thead>
              <tbody>
                {recentHandled.map((r) => (
                  <tr key={r.satisfaction_id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td
                      style={{
                        ...td,
                        padding: "9px 12px",
                        color: STATUS_COLOR[r.status],
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.status}
                    </td>
                    <td style={{ ...td, padding: "9px 12px", color: "#5a616e" }}>
                      {r.cause_category?.trim() || "미분류"}
                    </td>
                    <td
                      style={{
                        ...td,
                        padding: "9px 12px",
                        color: "#3a4150",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.action ?? undefined}
                    >
                      {r.action || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 내보내기 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <button
          style={{ ...exportBtn, opacity: filtered.length === 0 ? 0.5 : 1 }}
          disabled={filtered.length === 0}
          onClick={() => onExport("csv")}
        >
          CSV 내보내기
        </button>
        <button
          style={{ ...exportBtn, opacity: filtered.length === 0 ? 0.5 : 1 }}
          disabled={filtered.length === 0}
          onClick={() => onExport("xlsx")}
        >
          XLSX 내보내기
        </button>
      </div>

      {/* 필터 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>기간</span>
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
                setPage(1);
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>평가 사유</span>
            <Dropdown
              value={reasonFilter}
              options={reasonOptions}
              onChange={(v) => {
                setReasonFilter(v);
                setPage(1);
              }}
              width={150}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>상태</span>
            <Dropdown
              value={statusFilter}
              options={statusOptions}
              onChange={(v) => {
                setStatusFilter(v as FeedbackStatus | "all");
                setPage(1);
              }}
              width={120}
            />
          </div>
          <input
            placeholder="질의어 입력"
            style={searchInput}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button style={outlineBtn} onClick={resetFilters}>
            필터 초기화
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              tableLayout: "fixed",
              minWidth: 1360,
            }}
          >
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 116 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                <th style={th}>No.</th>
                <th style={th}>평가일시</th>
                <th style={th}>질의어</th>
                <th style={th}>AI 답변</th>
                <th style={th}>평가 사유</th>
                <th style={th}>의견</th>
                <th style={th}>처리 상태</th>
                <th style={th}>원인 분류</th>
                <th style={th}>피드백 내용</th>
                <th style={th}>담당자명</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ ...td, padding: 44, color: "#9aa1ad" }}>
                    조건에 맞는 불만족 건이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.satisfaction_id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ ...td, color: "#6b7280", fontWeight: 500 }}>
                      {r.record_no}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {kstDatePart(r.created_at)}
                    </td>
                    <td style={{ ...td, ...cellText }} title={r.query ?? undefined}>
                      {r.query ?? "-"}
                    </td>
                    <td
                      style={{ ...td, ...cellText, color: "#6b7280" }}
                      title={r.summary_text ?? undefined}
                    >
                      {r.summary_text ?? "-"}
                    </td>
                    <td
                      style={{ ...td, ...cellText, color: "#5a616e" }}
                      title={r.reason ? reasonLabel(r.reason) : undefined}
                    >
                      {r.reason ? reasonLabel(r.reason) : "-"}
                    </td>
                    <td
                      style={{ ...td, ...cellText, color: "#9aa1ad" }}
                      title={r.comment ?? undefined}
                    >
                      {r.comment || "-"}
                    </td>
                    <td style={td}>
                      <StatusSelect
                        value={r.status}
                        disabled={saving}
                        onChange={(s) => onQuickStatus(r, s)}
                      />
                    </td>
                    <td
                      style={{ ...td, ...cellText, color: "#6b7280" }}
                      title={r.cause_category ?? undefined}
                    >
                      {r.cause_category ?? "-"}
                    </td>
                    <td
                      style={{ ...td, ...cellText, color: "#3a4150" }}
                      title={r.action ?? undefined}
                    >
                      {r.action || "-"}
                    </td>
                    <td
                      style={{ ...td, ...cellText }}
                      title={r.updated_by ?? undefined}
                    >
                      {r.updated_by ?? "-"}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => setEditing(r)}
                        style={{
                          height: 34,
                          padding: "0 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "Pretendard, sans-serif",
                          color: "#fff",
                          background: "#2f6bff",
                          border: "none",
                          borderRadius: 8,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        피드백
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18 }}>
          <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
        </div>
      </div>

      {editing && (
        <FeedbackDialog
          row={editing}
          currentUserName={currentUser.name || currentUser.empNo}
          saving={saving}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** 상태 인라인 셀렉트 (색상 pill + 팝오버) */
function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: FeedbackStatus;
  onChange: (s: FeedbackStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 55 }}
        />
      )}
      <div
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: 104,
          height: 36,
          padding: "0 12px",
          fontSize: 13,
          fontWeight: 600,
          color: STATUS_COLOR[value],
          background: STATUS_BG[value],
          border: `1px solid ${open ? "#2f6bff" : "transparent"}`,
          borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          userSelect: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span>{value}</span>
        <span style={{ color: "#9aa1ad", fontSize: 9 }}>▼</span>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 42,
            left: 0,
            zIndex: 60,
            minWidth: 116,
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 6,
          }}
        >
          {FEEDBACK_STATUSES.map((s) => (
            <div
              key={s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              style={{
                padding: "9px 12px",
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: s === value ? 700 : 500,
                color: s === value ? "#2f6bff" : "#3a4150",
                whiteSpace: "nowrap",
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
