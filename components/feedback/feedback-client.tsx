"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildFeedbackRows,
  upsertFeedback,
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
  CAUSE_CATEGORIES,
  CAUSE_CHART_COLORS,
  CAUSE_FALLBACK_COLOR,
  causeDisplayShares,
} from "@/lib/cause-categories";
import { DEPARTMENTS, parseDepartments } from "@/lib/departments";
import {
  formatKstDateTime,
  kstDatePart,
  isDateRangeInvalid,
} from "@/lib/format-date";
import { exportRows, type ExportFormat } from "@/lib/export";
import {
  FEEDBACK_STATUSES,
  statusLabel,
  STATUS_COLOR,
  statusTint,
  statusInk,
  onWhiteText,
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
import { useChartPdfExport } from "@/lib/use-chart-pdf-export";
import {
  applyChartDefaults,
  CHART_TEXT_COLOR,
  COMMON_PIE_PROPS,
} from "@/lib/chart-style";

ChartJS.register(ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family =
  "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
// 텍스트 색/크기/두께는 공통 스타일(applyChartDefaults, mount 후)로 통일한다.
ChartJS.defaults.color = CHART_TEXT_COLOR;
// 인쇄 스냅샷이 최종 상태를 담도록 애니메이션 비활성화. (devicePixelRatio 는 window 접근이라 mount 후 설정)
ChartJS.defaults.animation = false;

const PAGE_SIZE = 10;

/** 원인 도넛 — 대시보드 원인 도넛과 동일(반지름 115 − 안쪽 90, 링 두께 25px). */
const DONUT_RADIUS = 115;
const DONUT_CUTOUT = 90;

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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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
  const [causeFilter, setCauseFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FeedbackRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Chart.js 는 브라우저 캔버스가 필요하므로 mount 후에만 렌더
  const [mounted, setMounted] = useState(false);
  // 캔버스 렌더 해상도 배율 — arc 곡선의 계단현상을 줄이려 실제 devicePixelRatio 의
  // 2배로 슈퍼샘플링(정수 2:1 다운샘플). SSR 엔 window 가 없으므로 2 로 두고,
  // 클라이언트 첫 렌더의 lazy initializer 에서 확정한다(차트는 mount 후에만 렌더).
  const [superDpr] = useState(() =>
    typeof window !== "undefined" ? 2 * (window.devicePixelRatio || 1) : 2,
  );
  useEffect(() => {
    // 공통 차트 기본값(폰트·색) 적용.
    applyChartDefaults();
    setMounted(true);
  }, []);

  // PDF 내보내기(인쇄) — 차트 스냅샷 + A4 리플로우 공용 훅. 차트 컨테이너에 pdf-chart-box 지정.
  const { exportPdf } = useChartPdfExport();

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
        // arc 크기는 최소 각도가 보장된 표시 비율로 그린다(비중 작은 분류도 보이게).
        // 실제 건수/비율은 아래 툴팁·HTML 범례에서 c.count 로 노출한다.
        data: causeDisplayShares(causeCounts.map((c) => c.count)),
        backgroundColor: causeCounts.map(
          (c) => CAUSE_CHART_COLORS[c.category] ?? CAUSE_FALLBACK_COLOR,
        ),
        ...COMMON_PIE_PROPS,
        // 최소 각도로 보장한 얇은 조각의 색이 흰 경계(2px)에 다시 묻히지 않도록 1px.
        borderWidth: 1,
      },
    ],
  };
  const causeChartOptions = {
    devicePixelRatio: superDpr,
    responsive: true,
    maintainAspectRatio: false,
    radius: DONUT_RADIUS,
    cutout: DONUT_CUTOUT,
    plugins: {
      // 범례는 canvas 대신 HTML로 그린다(아래 JSX). canvas 텍스트는 ClearType
      // 서브픽셀 힌팅을 못 써 DOM 텍스트보다 물렁하게 보이므로, 범례를 HTML로
      // 빼 일반 텍스트와 동일한 선명도로 맞춘다. 도넛 조각만 canvas 에 남는다.
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
            // ctx.parsed 는 최소 각도가 섞인 "표시 비율"이므로 쓰지 않는다.
            // 실제 건수/비율은 원본 causeCounts 에서 인덱스로 가져와 표기(왜곡 방지).
            const v = causeCounts[ctx.dataIndex]?.count ?? 0;
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
      if (causeFilter !== "all") {
        const c = r.cause_category?.trim() || "미분류";
        if (c !== causeFilter) return false;
      }
      // 유관 부서: 쉼표 구분 다중값이므로 부분 포함 매칭
      if (
        deptFilter !== "all" &&
        !parseDepartments(r.related_department).includes(deptFilter)
      )
        return false;
      if (from && kstDatePart(r.created_at) < from) return false;
      if (to && kstDatePart(r.created_at) > to) return false;
      if (q) {
        if (!(r.query ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [
    allRows,
    statusFilter,
    reasonFilter,
    causeFilter,
    deptFilter,
    search,
    dateFrom,
    dateTo,
    dateRangeInvalid,
  ]);

  function resetFilters() {
    setSearch("");
    setReasonFilter("all");
    setStatusFilter("all");
    setCauseFilter("all");
    setDeptFilter("all");
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
      // 낙관적 반영: DB 저장 성공을 확인한 뒤 로컬 state 를 즉시 upsert 해 목록을 바로
      // 갱신한다(체감 지연 제거). 표시용 파생값(수정일시·담당자명·신규 id)은 근사이며,
      // 아래 router.refresh() 가 서버(정본) 값으로 덮어써 정합을 맞춘다. 저장 로직은 불변.
      setFeedback((prev) =>
        upsertFeedback(
          prev,
          edit,
          currentUser.name || currentUser.empNo,
          new Date().toISOString(),
        ),
      );
      router.refresh();
      setToast(successMsg);
      setTimeout(() => setToast(null), 4000);
      return true;
    } catch (e) {
      // 서버 액션이 throw 한 경우(세션/네트워크/DB 예외 등)도 조용히 넘어가지 않게 노출
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[feedback] 저장 중 예외:", e);
      setToast(`저장 실패 — ${msg}`);
      setTimeout(() => setToast(null), 6000);
      return false;
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
        related_department: row.related_department,
        action: row.action,
        memo: row.memo,
      },
      `상태 변경 — No.${row.record_no} → ${statusLabel(status)}`,
    );
  }

  function onExport(format: ExportFormat) {
    const flat = filtered.map((r) => ({
      "No. (record_no)": r.record_no,
      "평가일시 (created_at)": kstDatePart(r.created_at),
      "질의어 (query)": r.query ?? "",
      "AI 답변 (summary_text)": r.summary_text ?? "",
      "평가 사유 (reason)": r.reason ? reasonLabel(r.reason) : "",
      "의견 (comment)": r.comment ?? "",
      "기기 종류 (device_type)": r.device_type ?? "",
      "가드레일 (guardrail_label)": r.guardrail_label ?? "",
      "원인 분류 (cause_category)": r.cause_category ?? "",
      "유관 부서 (related_department)": r.related_department ?? "",
      "피드백 내용 (action)": r.action ?? "",
      "처리 상태 (status)": statusLabel(r.status),
      "담당자명 (updated_by)": r.updated_by ?? "",
      "수정일시 (updated_at)": r.updated_at ? formatKstDateTime(r.updated_at) : "",
    }));
    exportRows(flat, `feedback_${new Date().toISOString().slice(0, 10)}`, format);
  }

  const reasonOptions = [
    { label: "전체", value: "all" },
    ...REASON_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  ];
  const statusOptions = [
    { label: "전체", value: "all" },
    ...FEEDBACK_STATUSES.map((s) => ({ label: statusLabel(s), value: s })),
  ];
  const causeOptions = [
    { label: "전체", value: "all" },
    ...CAUSE_CATEGORIES.map((c) => ({ label: c, value: c })),
    { label: "미분류", value: "미분류" },
  ];
  const deptOptions = [
    { label: "전체", value: "all" },
    ...DEPARTMENTS.map((d) => ({ label: d, value: d })),
  ];

  const kpis = [
    { label: "불만족 총건수", value: allRows.length, color: "#1a1d23" },
    ...FEEDBACK_STATUSES.map((s) => ({
      label: statusLabel(s),
      value: statusCounts[s],
      color: onWhiteText(STATUS_COLOR[s]),
    })),
  ];

  return (
    // 목록 표(11열)가 붕괴하지 않는 하한 폭을 페이지 전체에 건다 → 이보다 좁아지면
    // 페이지가 통째로 가로 스크롤된다(각 카드가 함께 넓어져 표/버튼이 카드를 삐져나가지 않음).
    // 인쇄 시에는 globals.css @media print 에서 min-width:0 으로 해제된다.
    <div className="pdf-report" style={{ minWidth: 1300 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          margin: "0 0 28px",
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
          불만족 평가 관리
        </h1>
        <button
          type="button"
          style={{
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
          }}
          onClick={() => void exportPdf()}
          title="이 페이지를 PDF로 내보내기 (인쇄 대화상자에서 'PDF로 저장' 선택)"
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

      {toast && <div className="toast">{toast}</div>}

      {/* 통계 KPI 5개 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
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
        className="pdf-chart-row"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 3fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="card-block" style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: "-0.3px" }}>
            원인 분류별 통계
          </div>
          {causeCounts.length === 0 ? (
            <p style={{ color: "#8a909c", fontSize: 13 }}>데이터가 없습니다.</p>
          ) : (
            // 도넛(좌) + 범례 세로 일렬(우) 묶음을 카드 가운데 정렬한다.
            <div
              className="pdf-chart-box pdf-donut-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 100,
                height: 300,
              }}
            >
              <div style={{ position: "relative", width: 250, height: "100%", flexShrink: 0 }}>
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
              {/* 범례 — 차트 우측 세로 일렬. HTML(DOM) 렌더로 일반 텍스트와 동일한 선명도 */}
              {mounted && (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    flexShrink: 0,
                  }}
                >
                  {causeCounts.map((c) => (
                    <li
                      key={c.category}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
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
                          background:
                            CAUSE_CHART_COLORS[c.category] ?? CAUSE_FALLBACK_COLOR,
                          flexShrink: 0,
                        }}
                      />
                      {c.category}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="card-block" style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: "-0.3px" }}>
            처리 현황
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "48%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f7f8fa" }}>
                  <th style={{ ...th, padding: "9px 12px", color: "#5a616e", fontWeight: 500 }}>상태</th>
                  <th style={{ ...th, padding: "9px 12px", color: "#5a616e", fontWeight: 500 }}>원인 분류</th>
                  <th style={{ ...th, padding: "9px 12px", color: "#5a616e", fontWeight: 500 }}>피드백 내용</th>
                </tr>
              </thead>
              <tbody>
                {recentHandled.map((r) => (
                  <tr key={r.satisfaction_id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td
                      style={{
                        ...td,
                        padding: "9px 12px",
                        color: statusInk(STATUS_COLOR[r.status]),
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusLabel(r.status)}
                    </td>
                    <td style={{ ...td, padding: "9px 12px", color: "#5a616e", fontWeight: 500 }}>
                      {r.cause_category?.trim() || "미분류"}
                    </td>
                    <td
                      style={{
                        ...td,
                        padding: "9px 12px",
                        color: "#5a616e",
                        fontWeight: 500,
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

      {/* 내보내기 (인쇄 시 숨김) */}
      <div
        className="no-print"
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

      {/* 필터 (인쇄 시 숨김) */}
      <div className="no-print" style={{ ...card, marginBottom: 20 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>원인 분류</span>
            <Dropdown
              value={causeFilter}
              options={causeOptions}
              onChange={(v) => {
                setCauseFilter(v);
                setPage(1);
              }}
              width={150}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>유관 부서</span>
            <Dropdown
              value={deptFilter}
              options={deptOptions}
              onChange={(v) => {
                setDeptFilter(v);
                setPage(1);
              }}
              width={170}
              searchable
              ariaLabel="유관 부서 필터"
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
        {/* 표는 width:100% 로 카드 안을 꽉 채우기만 한다(카드 밖으로 넘치지 않음 → 우측
            '피드백' 버튼이 카드를 삐져나가지 않는다). 좁은 화면에서 퍼센트 컬럼이 붕괴하지
            않도록 하는 하한선은 페이지 루트(.pdf-report)의 min-width 로 걸어 두었고, 그 이하
            에서는 페이지 전체가 가로 스크롤된다. (overflow-x:auto 를 쓰지 않는 이유: overflow-y
            도 auto 가 되어 하단 행의 상태 드롭다운 팝오버가 세로로 잘리기 때문.) */}
        <div>
          <table
            className="fb-list-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              tableLayout: "fixed",
            }}
          >
            {/* 퍼센트 컬럼 (합계 100%) — 컨테이너 폭에 맞춰 가로 스크롤 없이 배분 */}
            <colgroup>
              <col style={{ width: "3%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "7%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                <th style={th}>No.</th>
                <th style={th}>평가일시</th>
                <th style={th}>질의어</th>
                <th style={th}>AI 답변</th>
                <th style={th}>평가 사유</th>
                <th style={th}>처리 상태</th>
                <th style={th}>원인 분류</th>
                <th style={th}>유관 부서</th>
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
                    {/* 상태 셀은 좌우 패딩 0: 가운데 정렬된 셀렉트 버튼이 좁은 컬럼(7%)에서도
                        텍스트만큼 폭을 확보하도록(td 기본 14px 패딩이 버튼 공간을 잠식) */}
                    <td style={{ ...td, padding: "12px 0" }}>
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
                      style={{ ...td, ...cellText, color: "#5a616e" }}
                      title={r.related_department ?? undefined}
                    >
                      {r.related_department ?? "-"}
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
                          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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

        <div className="no-print" style={{ marginTop: 18 }}>
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
    <div style={{ position: "relative", display: "block" }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 55 }}
        />
      )}
      <div
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          width: "100%",
          maxWidth: 96,
          margin: "0 auto",
          height: 36,
          padding: "0 10px",
          fontSize: 13,
          fontWeight: 600,
          color: statusInk(STATUS_COLOR[value]),
          background: statusTint(STATUS_COLOR[value]),
          border: `1px solid ${open ? "#2f6bff" : "transparent"}`,
          borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          userSelect: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ whiteSpace: "nowrap" }}>{statusLabel(value)}</span>
        <span style={{ color: "#9aa1ad", fontSize: 9 }}>▼</span>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            // 항상 버튼 하단에 고정. (리스트 overflow 래퍼를 제거해 하단 행도 잘리지 않음)
            top: 42,
            // 트리거 버튼이 셀 안에서 가운데 정렬(margin:0 auto)이므로 팝오버도 중앙에 맞춘다
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            width: 96,
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 5,
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
                padding: "9px 10px",
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: s === value ? 700 : 500,
                color: s === value ? "#2f6bff" : "#3a4150",
                whiteSpace: "nowrap",
              }}
            >
              {statusLabel(s)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
