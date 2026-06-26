"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  querySatisfaction,
  type QueryParams,
  type SortDir,
  type SortKey,
} from "@/lib/data/satisfaction-query";
import { accumulateSatisfaction } from "@/lib/data/accumulate-satisfaction";
import { computeDisplayNo } from "@/lib/data/display-no";
import { exportRows, type ExportFormat } from "@/lib/export";
import { reasonLabel, REASON_OPTIONS } from "@/lib/reasons";
import { formatKstDateTime, isDateRangeInvalid } from "@/lib/format-date";
import type {
  ParsedSatisfaction,
  Rating,
  Satisfaction,
  UploadBatch,
  UploadSummary,
} from "@/lib/types";
import { uploadSatisfaction } from "@/app/(app)/records/actions";
import UploadDialog from "./upload-dialog";

const PAGE_SIZES = [10, 20, 50];

/**
 * 메뉴 ② 만족도 평가 데이터 조회 (FR-3) — 누적 데이터 기준.
 * 검색/필터/정렬/페이징/내보내기 + 수동 업로드(FR-1.2) 누적 적재.
 * - dbMode=true  : 서버 액션으로 실제 DB 적재 후 새로고침
 * - dbMode=false : 세션 메모리에 누적(새로고침 시 초기화)
 */
export default function RecordsClient({
  initialRecords,
  initialBatches,
  dbMode,
}: {
  initialRecords: Satisfaction[];
  initialBatches: UploadBatch[];
  dbMode: boolean;
}) {
  const router = useRouter();
  const [records, setRecords] = useState<Satisfaction[]>(initialRecords);
  const [batches, setBatches] = useState<UploadBatch[]>(initialBatches);

  // DB 모드: 서버가 진실원본. props 변경 시(새로고침 후) 상태 동기화.
  useEffect(() => setRecords(initialRecords), [initialRecords]);
  useEffect(() => setBatches(initialBatches), [initialBatches]);

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
  const [lastSummary, setLastSummary] = useState<UploadSummary | null>(null);
  const [uploading, setUploading] = useState(false);

  // No.(표시번호): 전체 누적 데이터 평가시각 과거순 1..N (created_at 기준)
  const displayNo = useMemo(() => computeDisplayNo(records), [records]);

  // 시작일이 종료일보다 미래면 잘못된 조합 → 필터 적용 차단 + 안내
  const dateRangeInvalid = isDateRangeInvalid(dateFrom, dateTo);

  const params: QueryParams = {
    search,
    rating,
    reason,
    dateFrom: dateRangeInvalid ? undefined : dateFrom || undefined,
    dateTo: dateRangeInvalid ? undefined : dateTo || undefined,
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
    const all = querySatisfaction(records, {
      ...params,
      page: 1,
      pageSize: result.total || 1,
    });
    const flat = all.rows.map((r) => ({
      no: displayNo.get(r.id) ?? r.record_no,
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

  function showSummaryToast(s: UploadSummary) {
    setLastSummary(s);
    setToast(
      `적재 완료 — 신규 ${s.inserted_count} · 갱신 ${s.updated_count} · 파일 내 중복 ${s.duplicate_count} · 실패 ${s.failed_count}`,
    );
    setTimeout(() => setToast(null), 5000);
  }

  /** 업로드 확정: 검증 통과 행 + 파일 통계 수신 */
  async function onUploadConfirm(
    valid: ParsedSatisfaction[],
    meta: { fileName: string; totalRows: number; failedCount: number },
  ) {
    setUploading(true);
    try {
      if (dbMode) {
        // 실제 DB 적재 (서버 액션) → 성공 시 서버 데이터 새로고침
        const res = await uploadSatisfaction(valid, meta);
        if (!res.ok || !res.summary) {
          setToast(`업로드 실패 — ${res.error ?? "알 수 없는 오류"}`);
          setTimeout(() => setToast(null), 6000);
          return;
        }
        setShowUpload(false);
        showSummaryToast(res.summary);
        router.refresh();
      } else {
        // 더미/세션 모드: 인메모리 누적
        const batchId = crypto.randomUUID();
        const { merged, inserted, updated, duplicate } = accumulateSatisfaction(
          records,
          valid,
          batchId,
        );
        setRecords(merged);
        const summary: UploadSummary = {
          file_name: meta.fileName,
          uploaded_at: new Date().toISOString(),
          row_count: meta.totalRows,
          inserted_count: inserted,
          updated_count: updated,
          failed_count: meta.failedCount,
          duplicate_count: duplicate,
        };
        // 세션 이력에도 추가
        setBatches((prev) => [
          {
            id: batchId,
            file_name: summary.file_name,
            uploaded_by: "(세션)",
            uploaded_at: summary.uploaded_at,
            row_count: summary.row_count,
            inserted_count: summary.inserted_count,
            updated_count: summary.updated_count,
            failed_count: summary.failed_count,
            duplicate_count: summary.duplicate_count,
            status: "completed",
            error_message: null,
          },
          ...prev,
        ]);
        setShowUpload(false);
        setPage(1);
        showSummaryToast(summary);
      }
    } finally {
      setUploading(false);
    }
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
      <h1 className="page-title">② 만족도 평가 데이터 조회</h1>
      <p className="page-desc">
        누적 원본 레코드 표 (검색 · 필터 · 정렬 · 페이징 · 내보내기 · 업로드)
      </p>

      {toast && <div className="toast">{toast}</div>}

      {/* 최근 업로드 이력 */}
      {batches.length === 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="placeholder" style={{ margin: 0 }}>
            아직 업로드 이력이 없습니다.
          </p>
        </div>
      ) : (
        <details className="card" style={{ marginBottom: 16 }}>
          <summary>최근 업로드 이력 ({batches.length})</summary>
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>파일</th>
                <th>업로더</th>
                <th>시각</th>
                <th>행</th>
                <th>신규</th>
                <th>갱신</th>
                <th>파일 내 중복</th>
                <th>실패</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="ellipsis">{b.file_name ?? "-"}</td>
                  <td className="nowrap">{b.uploaded_by ?? "-"}</td>
                  <td className="nowrap">{formatKstDateTime(b.uploaded_at)}</td>
                  <td>{b.row_count}</td>
                  <td>{b.inserted_count}</td>
                  <td>{b.updated_count}</td>
                  <td>{b.duplicate_count}</td>
                  <td>{b.failed_count}</td>
                  <td className="nowrap">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* 툴바 */}
      <div className="toolbar card">
        <div className="toolbar-row">
          <input
            className="input grow"
            placeholder="검색 (질의어)"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <select
            className="input"
            value={rating}
            onChange={(e) => resetPage(setRating)(e.target.value as Rating | "all")}
          >
            <option value="all">전체 평가</option>
            <option value="up">👍 up</option>
            <option value="down">👎 down</option>
          </select>
          <select
            className="input"
            value={reason}
            onChange={(e) => resetPage(setReason)(e.target.value)}
          >
            <option value="all">전체 사유</option>
            {REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
              onChange={(e) => resetPage(setDateFrom)(e.target.value)}
            />
            ~
            <input
              type="date"
              className="input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => resetPage(setDateTo)(e.target.value)}
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
      <div className="card no-pad table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("created_at")}>
                No.{sortMark("created_at")}
              </th>
              <th className="sortable" onClick={() => toggleSort("created_at")}>
                평가시각{sortMark("created_at")}
              </th>
              <th>평가</th>
              <th>질의어</th>
              <th>AI 답변</th>
              <th>사유</th>
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
                <tr key={r.id}>
                  <td className="mono">{displayNo.get(r.id) ?? r.record_no}</td>
                  <td className="nowrap">{formatKstDateTime(r.created_at)}</td>
                  <td>
                    <span className={`badge ${r.rating}`}>
                      {r.rating === "up" ? "👍 up" : "👎 down"}
                    </span>
                  </td>
                  <td className="ellipsis" title={r.query ?? undefined}>
                    {r.query ?? "-"}
                  </td>
                  <td className="ellipsis" title={r.summary_text ?? undefined}>
                    {r.summary_text ?? "-"}
                  </td>
                  <td className="nowrap">{r.reason ? reasonLabel(r.reason) : "-"}</td>
                  <td className="ellipsis" title={r.comment ?? undefined}>
                    {r.comment ?? "-"}
                  </td>
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
          dbMode={dbMode}
          uploading={uploading}
          onConfirm={onUploadConfirm}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
