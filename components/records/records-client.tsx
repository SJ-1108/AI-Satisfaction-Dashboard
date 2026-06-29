"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  querySatisfaction,
  type QueryParams,
  type SortDir,
  type SortKey,
} from "@/lib/data/satisfaction-query";
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
import Dropdown from "@/components/ui/dropdown";
import DateRangePicker from "@/components/ui/date-range-picker";
import Pager from "@/components/ui/pager";

const PAGE_SIZES = [10, 20, 50];

// ── 공통 인라인 스타일 (디자인 톤) ──
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
const primaryBtn: React.CSSProperties = {
  height: 40,
  padding: "0 18px",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "Pretendard, sans-serif",
  color: "#fff",
  background: "#2f6bff",
  border: "none",
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
  padding: "13px 14px",
  textAlign: "center",
  color: "#3a4150",
};
const tdEllipsis: React.CSSProperties = {
  ...td,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * 메뉴 ② 데이터 조회 (FR-3) — 누적 데이터 기준.
 * 검색/필터/정렬/페이징/내보내기 + 수동 업로드(FR-1.2) 누적 적재.
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

  const [histOpen, setHistOpen] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<UploadSummary | null>(null);
  const [uploading, setUploading] = useState(false);

  const displayNo = useMemo(() => computeDisplayNo(records), [records]);
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

  function sortArrow(key: SortKey) {
    const active = sortKey === key;
    return {
      arrow: active ? (sortDir === "asc" ? "▲" : "▼") : "▼",
      color: active ? "#2f6bff" : "#cdd2da",
    };
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

  async function onUploadConfirm(
    valid: ParsedSatisfaction[],
    meta: { fileName: string; totalRows: number; failedCount: number },
  ) {
    setUploading(true);
    try {
      // 더미/실제 모드 모두 서버 액션으로 누적 적재 → 새로고침으로 모든 메뉴에 반영
      const res = await uploadSatisfaction(valid, meta);
      if (!res.ok || !res.summary) {
        setToast(`업로드 실패 — ${res.error ?? "알 수 없는 오류"}`);
        setTimeout(() => setToast(null), 6000);
        return;
      }
      setShowUpload(false);
      setPage(1);
      showSummaryToast(res.summary);
      router.refresh();
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

  const ratingOptions = [
    { label: "전체", value: "all" },
    { label: "👍 만족", value: "up" },
    { label: "👎 불만족", value: "down" },
  ];
  const reasonOptions = [
    { label: "전체", value: "all" },
    ...REASON_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  ];

  const noSort = sortArrow("created_at");

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
        데이터 조회
      </h1>

      {toast && <div className="toast">{toast}</div>}

      {/* 최근 업로드 이력 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div
          onClick={() => setHistOpen((v) => !v)}
          style={{
            fontSize: 15,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            letterSpacing: "-0.3px",
            cursor: "pointer",
            userSelect: "none",
            marginBottom: histOpen && batches.length > 0 ? 14 : 0,
          }}
        >
          <span style={{ fontSize: 10, color: "#9aa1ad" }}>
            {histOpen ? "▼" : "▶"}
          </span>{" "}
          최근 업로드 이력{" "}
          <span style={{ color: "#9aa1ad", fontWeight: 600 }}>
            ({batches.length})
          </span>
        </div>

        {histOpen &&
          (batches.length === 0 ? (
            <p style={{ margin: "12px 0 0", color: "#8a909c", fontSize: 13 }}>
              아직 업로드 이력이 없습니다.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 820,
                }}
              >
                <thead>
                  <tr style={{ background: "#f7f8fa" }}>
                    {["파일", "업로더", "시각", "행", "신규", "갱신", "파일 내 중복", "실패", "상태"].map(
                      (h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                      <td
                        style={{
                          ...td,
                          color: "#2f6bff",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.file_name ?? "-"}
                      </td>
                      <td style={td}>{b.uploaded_by ?? "-"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {formatKstDateTime(b.uploaded_at)}
                      </td>
                      <td style={td}>{b.row_count}</td>
                      <td style={td}>{b.inserted_count}</td>
                      <td style={td}>{b.updated_count}</td>
                      <td style={td}>{b.duplicate_count}</td>
                      <td style={td}>{b.failed_count}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "3px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: b.status === "completed" ? "#1f9d6a" : "#6b7280",
                            background:
                              b.status === "completed" ? "#e7f7ef" : "#eef0f3",
                            borderRadius: 6,
                          }}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>

      {/* 내보내기 / 업로드 */}
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
        <button style={exportBtn} onClick={() => onExport("csv")}>
          CSV 내보내기
        </button>
        <button style={exportBtn} onClick={() => onExport("xlsx")}>
          XLSX 내보내기
        </button>
        <button style={primaryBtn} onClick={() => setShowUpload(true)}>
          업로드
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
            <span style={filterLabel}>평가</span>
            <Dropdown
              value={rating}
              options={ratingOptions}
              onChange={(v) => resetPage(setRating)(v as Rating | "all")}
              width={120}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={filterLabel}>사유</span>
            <Dropdown
              value={reason}
              options={reasonOptions}
              onChange={(v) => resetPage(setReason)(v)}
              width={150}
            />
          </div>
          <input
            placeholder="질의어 입력"
            style={searchInput}
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
          <button style={outlineBtn} onClick={resetFilters}>
            필터 초기화
          </button>
        </div>
      </div>

      {/* 표 */}
      <div style={card}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              tableLayout: "fixed",
              minWidth: 940,
            }}
          >
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f7f8fa" }}>
                <th
                  style={{ ...th, cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleSort("created_at")}
                >
                  No.{" "}
                  <span style={{ color: noSort.color, fontSize: 10 }}>
                    {noSort.arrow}
                  </span>
                </th>
                <th
                  style={{ ...th, cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleSort("created_at")}
                >
                  평가시각{" "}
                  <span style={{ color: noSort.color, fontSize: 10 }}>
                    {noSort.arrow}
                  </span>
                </th>
                <th style={th}>평가</th>
                <th style={th}>질의어</th>
                <th style={th}>AI 답변</th>
                <th style={th}>사유</th>
                <th style={th}>의견</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, padding: 44, color: "#9aa1ad" }}>
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                result.rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <td style={{ ...td, color: "#6b7280", fontWeight: 500 }}>
                      {displayNo.get(r.id) ?? r.record_no}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {formatKstDateTime(r.created_at)}
                    </td>
                    <td style={td}>
                      <RatingBadge rating={r.rating} />
                    </td>
                    <td style={tdEllipsis} title={r.query ?? undefined}>
                      {r.query ?? "-"}
                    </td>
                    <td
                      style={{ ...tdEllipsis, color: "#6b7280" }}
                      title={r.summary_text ?? undefined}
                    >
                      {r.summary_text ?? "-"}
                    </td>
                    <td style={{ ...td, color: r.reason ? "#5a616e" : "#9aa1ad" }}>
                      {r.reason ? reasonLabel(r.reason) : "-"}
                    </td>
                    <td
                      style={{ ...tdEllipsis, color: "#9aa1ad" }}
                      title={r.comment ?? undefined}
                    >
                      {r.comment ?? "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지 크기 + 페이지네이션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Dropdown
            value={String(pageSize)}
            options={PAGE_SIZES.map((s) => ({ label: `${s}개씩`, value: String(s) }))}
            onChange={(v) => resetPage(setPageSize)(Number(v))}
            width={104}
            openUp
          />
          <Pager
            page={result.page}
            totalPages={result.totalPages}
            onPage={setPage}
          />
        </div>
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

/** 평가 배지 (디자인 톤) */
function RatingBadge({ rating }: { rating: Rating }) {
  const up = rating === "up";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        fontSize: 12,
        fontWeight: 600,
        color: up ? "#2f6bff" : "#e0635d",
        background: up ? "#eaf1ff" : "#fdecea",
        borderRadius: 6,
      }}
    >
      {up ? "👍 up" : "👎 down"}
    </span>
  );
}
