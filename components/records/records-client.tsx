"use client";

import { useMemo, useState } from "react";
import { DUMMY_SATISFACTION } from "@/lib/data/dummy-satisfaction";
import {
  distinctReasons,
  querySatisfaction,
  type QueryParams,
  type SortDir,
  type SortKey,
} from "@/lib/data/satisfaction-query";
import { upsertSatisfaction } from "@/lib/ingest/parse-satisfaction";
import { exportRows, type ExportFormat } from "@/lib/export";
import { reasonLabel } from "@/lib/reasons";
import type { Rating, Satisfaction } from "@/lib/types";
import UploadDialog from "./upload-dialog";

const PAGE_SIZES = [10, 20, 50];

/**
 * 메뉴 ② 메타베이스 데이터 조회 (FR-3) — 더미 데이터 기반.
 * 검색/필터/정렬/페이징/내보내기 + 수동 업로드(FR-1.2) upsert.
 */
export default function RecordsClient() {
  // 더미 소스를 클라이언트 상태로 보관 (업로드 시 갱신). 새로고침 시 초기화.
  const [records, setRecords] = useState<Satisfaction[]>(DUMMY_SATISFACTION);

  const [search, setSearch] = useState("");
  const [rating, setRating] = useState<Rating | "all">("all");
  const [reason, setReason] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reasons = useMemo(() => distinctReasons(records), [records]);

  const params: QueryParams = {
    search,
    rating,
    reason,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortKey,
    sortDir,
    page,
    pageSize,
  };

  const result = useMemo(
    () => querySatisfaction(records, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, search, rating, reason, dateFrom, dateTo, sortKey, sortDir, page, pageSize],
  );

  /** 필터 변경 시 1페이지로 리셋하는 헬퍼 */
  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function onExport(format: ExportFormat) {
    // 현재 필터 결과 전체(페이지 무시)를 내보낸다.
    const all = querySatisfaction(records, { ...params, page: 1, pageSize: result.total || 1 });
    const flat = all.rows.map((r) => ({
      search_event_id: r.search_event_id,
      rating: r.rating,
      reason: r.reason ?? "",
      reason_label: reasonLabel(r.reason),
      query: r.query ?? "",
      summary_text: r.summary_text ?? "",
      comment: r.comment ?? "",
      created_at: r.created_at,
    }));
    exportRows(flat, `satisfaction_${new Date().toISOString().slice(0, 10)}`, format);
  }

  function onUploadConfirm(rows: Satisfaction[]) {
    const { merged, inserted, updated } = upsertSatisfaction(records, rows);
    setRecords(merged);
    setShowUpload(false);
    setPage(1);
    setToast(`적재 완료 — 신규 ${inserted}건, 갱신 ${updated}건`);
    setTimeout(() => setToast(null), 4000);
  }

  function resetFilters() {
    setSearch("");
    setRating("all");
    setReason("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div>
      <h1 className="page-title">② 메타베이스 데이터 조회</h1>
      <p className="page-desc">
        원본 레코드 표 (검색 · 필터 · 정렬 · 페이징 · 내보내기) — 더미 데이터
      </p>

      {toast && <div className="toast">{toast}</div>}

      {/* 툴바 */}
      <div className="toolbar card">
        <div className="toolbar-row">
          <input
            className="input grow"
            placeholder="검색 (검색어/요약/의견/ID)"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <select
            className="input"
            value={rating}
            onChange={(e) => resetPage(setRating)(e.target.value as Rating | "all")}
          >
            <option value="all">전체 평가</option>
            <option value="up">👍 만족</option>
            <option value="down">👎 불만족</option>
          </select>
          <select
            className="input"
            value={reason}
            onChange={(e) => resetPage(setReason)(e.target.value)}
          >
            <option value="all">전체 사유</option>
            {reasons.map((rc) => (
              <option key={rc} value={rc}>
                {reasonLabel(rc)} ({rc})
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
              onChange={(e) => resetPage(setDateFrom)(e.target.value)}
            />
            ~
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => resetPage(setDateTo)(e.target.value)}
            />
          </label>
          <button className="btn-ghost" onClick={resetFilters}>
            필터 초기화
          </button>
          <div className="spacer" />
          <button className="btn-ghost" onClick={() => onExport("csv")}>
            CSV 내보내기
          </button>
          <button className="btn-ghost" onClick={() => onExport("xlsx")}>
            XLSX 내보내기
          </button>
          <button className="btn-primary inline" onClick={() => setShowUpload(true)}>
            업로드
          </button>
        </div>
      </div>

      {/* 결과 요약 */}
      <div className="result-meta">
        총 <strong>{result.total}</strong>건 · {result.page}/{result.totalPages}{" "}
        페이지
      </div>

      {/* 표 */}
      <div className="card no-pad">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("search_event_id")}>
                ID{sortMark("search_event_id")}
              </th>
              <th className="sortable" onClick={() => toggleSort("created_at")}>
                평가시각{sortMark("created_at")}
              </th>
              <th className="sortable" onClick={() => toggleSort("rating")}>
                평가{sortMark("rating")}
              </th>
              <th>사유</th>
              <th>검색어</th>
              <th>AI 요약</th>
              <th>의견</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              result.rows.map((r) => (
                <tr key={r.search_event_id}>
                  <td className="mono">{r.search_event_id}</td>
                  <td className="nowrap">
                    {r.created_at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    <span className={`badge ${r.rating}`}>
                      {r.rating === "up" ? "👍 up" : "👎 down"}
                    </span>
                  </td>
                  <td className="nowrap">{r.reason ? reasonLabel(r.reason) : "-"}</td>
                  <td className="ellipsis">{r.query}</td>
                  <td className="ellipsis">{r.summary_text}</td>
                  <td className="ellipsis">{r.comment ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      <div className="pager">
        <select
          className="input"
          value={pageSize}
          onChange={(e) => resetPage(setPageSize)(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}개씩
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button
          className="btn-ghost"
          disabled={result.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          이전
        </button>
        <span className="page-indicator">
          {result.page} / {result.totalPages}
        </span>
        <button
          className="btn-ghost"
          disabled={result.page >= result.totalPages}
          onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
        >
          다음
        </button>
      </div>

      {showUpload && (
        <UploadDialog
          onConfirm={onUploadConfirm}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
