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

const PAGE_SIZE = 10;

/** 상태 → 뱃지 색 클래스 */
const STATUS_CLASS: Record<FeedbackStatus, string> = {
  미확인: "st-new",
  검토중: "st-progress",
  조치완료: "st-done",
  보류: "st-hold",
};

/**
 * 메뉴 ③ 불만족 관리 (FR-4) — 누적 데이터 기준.
 * 불만족 건 조회 · 피드백 입력(작성자 자동 기록) · 진행 상태 · 상세 사유 통계.
 * feedback 은 satisfaction_id 로 연결. 재업로드 후에도 연결 유지.
 */
export default function FeedbackClient({
  currentUser,
  satisfaction,
  initialFeedback,
  dbMode,
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

  // 전체 불만족 조인 뷰 (통계는 필터와 무관하게 전체 기준)
  const allRows = useMemo(
    () => buildFeedbackRows(satisfaction, feedback),
    [satisfaction, feedback],
  );

  const statusCounts = useMemo(() => countByStatus(allRows), [allRows]);
  const causeCounts = useMemo(() => countByCauseCategory(allRows), [allRows]);
  const handled = useMemo(() => handledRate(allRows), [allRows]);

  // 시작일이 종료일보다 미래면 잘못된 조합 → 기간 필터 적용 차단 + 안내 (/records 와 동일)
  const dateRangeInvalid = isDateRangeInvalid(dateFrom, dateTo);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateRangeInvalid ? "" : dateFrom;
    const to = dateRangeInvalid ? "" : dateTo;
    return allRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      // 평가 사유 필터 (DB reason 코드 기준)
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      // 기간 필터는 평가시각(created_at) KST 날짜 기준 (시작일~종료일 포함)
      if (from && kstDatePart(r.created_at) < from) return false;
      if (to && kstDatePart(r.created_at) > to) return false;
      // 검색 대상은 질의어(query)로만 제한
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
      if (dbMode) {
        const res = await saveFeedback(edit);
        if (!res.ok) {
          setToast(`저장 실패 — ${res.error ?? "알 수 없는 오류"}`);
          setTimeout(() => setToast(null), 5000);
          return false;
        }
        router.refresh();
      } else {
        const now = new Date().toISOString();
        setFeedback((prev) => upsertFeedback(prev, edit, currentUser.empNo, now));
      }
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

  function setStatusFilterReset(v: FeedbackStatus | "all") {
    setStatusFilter(v);
    setPage(1);
  }

  /** 현재 검색/상태 필터 결과(filtered)를 한글 컬럼으로 내보낸다 (FR-3.3 재사용). */
  function onExport(format: ExportFormat) {
    const flat = filtered.map((r) => ({
      "No.": r.record_no,
      평가시각: kstDatePart(r.created_at),
      질의어: r.query ?? "",
      "평가 사유": r.reason ? reasonLabel(r.reason) : "",
      의견: r.comment ?? "",
      상태: r.status,
      "상세 사유": r.detail_reason ?? "",
      "원인 분류": r.cause_category ?? "",
      "조치 내용": r.action ?? "",
      메모: r.memo ?? "",
      담당자: r.updated_by ?? "",
      수정일시: r.updated_at ? formatKstDateTime(r.updated_at) : "",
    }));
    exportRows(flat, `feedback_${new Date().toISOString().slice(0, 10)}`, format);
  }

  return (
    <div>
      <h1 className="page-title">③ 불만족 피드백 관리</h1>
      <p className="page-desc">
        불만족 건 조회 · 피드백 입력(작성자 자동 기록) · 진행 상태 · 상세 사유 통계 — 누적 데이터 기준
      </p>

      {toast && <div className="toast">{toast}</div>}

      {/* 통계 (FR-4.4) — 5개 항목 한 줄 표시 */}
      <div className="kpi-grid-5">
        <div className="kpi-card">
          <div className="kpi-label">불만족 총건수</div>
          <div className="kpi-value down">{allRows.length}</div>
        </div>
        {FEEDBACK_STATUSES.map((s) => (
          <div className="kpi-card" key={s}>
            <div className="kpi-label">{s}</div>
            <div className="kpi-value">{statusCounts[s]}</div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="card chart-box">
          <div className="chart-title">원인 분류별 통계 (FR-4.4)</div>
          {causeCounts.length === 0 ? (
            <p className="placeholder">데이터가 없습니다.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>원인 분류</th>
                  <th style={{ width: 80 }}>건수</th>
                </tr>
              </thead>
              <tbody>
                {causeCounts.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card chart-box">
          <div className="chart-title">처리 현황</div>
          <div className="kpi-value">{handled}%</div>
          <p className="placeholder" style={{ marginTop: 8 }}>
            미확인 외 상태로 처리된 비율
          </p>
        </div>
      </div>

      {/* 툴바 */}
      <div className="toolbar card">
        <div className="toolbar-row">
          <input
            className="input grow"
            placeholder="검색 (질의어)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">전체 사유</option>
            {REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilterReset(e.target.value as FeedbackStatus | "all")
            }
          >
            <option value="all">전체 상태</option>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-row">
          <label className="inline-label">
            기간
            <input
              type="date"
              className="input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
            ~
            <input
              type="date"
              className="input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {dateRangeInvalid && (
            <span className="error-msg" style={{ margin: 0 }}>
              시작일이 종료일보다 늦습니다 — 기간을 다시 선택하세요.
            </span>
          )}
          <button className="btn-ghost" onClick={resetFilters}>
            필터 초기화
          </button>
          <div className="spacer" />
          <button
            className="btn-ghost"
            disabled={filtered.length === 0}
            onClick={() => onExport("csv")}
          >
            CSV 내보내기
          </button>
          <button
            className="btn-ghost"
            disabled={filtered.length === 0}
            onClick={() => onExport("xlsx")}
          >
            XLSX 내보내기
          </button>
        </div>
      </div>

      <div className="result-meta">
        총 <strong>{filtered.length}</strong>건 · {safePage}/{totalPages} 페이지
      </div>

      {/* 목록 (FR-4.1) */}
      <div className="card no-pad table-scroll">
        <table className="data-table feedback-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>평가시각</th>
              <th>질의어</th>
              <th>평가 사유</th>
              <th>의견</th>
              <th>상태</th>
              <th>원인 분류</th>
              <th>담당자</th>
              <th className="action-cell"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty">
                  조건에 맞는 불만족 건이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.satisfaction_id}>
                  <td className="mono">{r.record_no}</td>
                  <td className="nowrap">{kstDatePart(r.created_at)}</td>
                  <td className="ellipsis" title={r.query ?? undefined}>
                    {r.query ?? "-"}
                  </td>
                  <td className="nowrap">
                    {r.reason ? reasonLabel(r.reason) : "-"}
                  </td>
                  <td className="ellipsis" title={r.comment || undefined}>
                    {r.comment || ""}
                  </td>
                  <td>
                    <select
                      className={`input status-select ${STATUS_CLASS[r.status]}`}
                      value={r.status}
                      disabled={saving}
                      onChange={(e) =>
                        onQuickStatus(r, e.target.value as FeedbackStatus)
                      }
                    >
                      {FEEDBACK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ellipsis cause-cell" title={r.cause_category ?? undefined}>
                    {r.cause_category
                      ? r.cause_category.length > 10
                        ? `${r.cause_category.slice(0, 10)}…`
                        : r.cause_category
                      : "-"}
                  </td>
                  <td className="nowrap">{r.updated_by ?? "-"}</td>
                  <td className="action-cell">
                    <button className="btn-feedback" onClick={() => setEditing(r)}>
                      피드백
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      <div className="pager">
        <div className="spacer" />
        <button
          className="btn-ghost"
          disabled={safePage <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          이전
        </button>
        <span className="page-indicator">
          {safePage} / {totalPages}
        </span>
        <button
          className="btn-ghost"
          disabled={safePage >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          다음
        </button>
      </div>

      {editing && (
        <FeedbackDialog
          row={editing}
          saving={saving}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
