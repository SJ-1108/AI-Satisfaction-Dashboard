"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  QueryParams,
  SortDir,
  SortKey,
} from "@/lib/data/satisfaction-query";
import { exportRows, type ExportFormat } from "@/lib/export";
import { reasonLabel, REASON_OPTIONS } from "@/lib/reasons";
import { formatKstDateTime, isDateRangeInvalid } from "@/lib/format-date";
import type {
  ParsedSatisfaction,
  Rating,
  ResetLog,
  Satisfaction,
  UploadBatch,
  UploadRowLog,
} from "@/lib/types";
import {
  appendSatisfactionRows,
  exportRecordsChunk,
  finishUpload,
  queryRecordsPage,
  resetData,
  type RecordsPage,
} from "@/app/(app)/records/actions";
import UploadDialog from "./upload-dialog";
import RecordDetailDialog from "./record-detail-dialog";
import CloseButton from "@/components/ui/close-button";
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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
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
  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
  color: "#2f6bff",
  background: "#fff",
  border: "1px solid #2f6bff",
  borderRadius: 10,
  cursor: "pointer",
};
const searchInputStyle: React.CSSProperties = {
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
/** 스크롤 시 상단 고정되는 표 헤더 (배경을 줘 행이 비치지 않게) */
const stickyTh: React.CSSProperties = {
  ...th,
  position: "sticky",
  top: 0,
  background: "#f7f8fa",
  zIndex: 1,
};

/**
 * 파일 내 중복(밀려난 이전 행)을 upload_batch_rows 로그로 변환.
 * satisfaction_id 는 서버 결과 회수 후 별도로 보강한다(같은 record_key 최종 행의 id).
 */
function makeDuplicateLog(p: ParsedSatisfaction): UploadRowLog {
  return {
    row_number: p.row_number ?? 0,
    action: "duplicate",
    record_key: p.record_key,
    satisfaction_id: null,
    query: p.query,
    rating: p.rating,
    reason: p.reason,
    comment: p.comment,
    summary_text: p.summary_text,
    feedback_created_at: p.created_at,
    device_type: p.device_type,
    guardrail_label: p.guardrail_label,
    device_type_before: null,
    device_type_after: null,
    guardrail_label_before: null,
    guardrail_label_after: null,
    error_message: null,
    raw_row: p.raw_row ?? null,
  };
}

/**
 * 메뉴 ② 데이터 조회 (FR-3) — 누적 데이터 기준.
 * 검색/필터/정렬/페이징/내보내기 + 수동 업로드(FR-1.2) 누적 적재.
 */
export default function RecordsClient({
  initialPage,
  initialBatches,
  initialResetLogs,
  dbCount,
  dbMode,
}: {
  /** 서버에서 렌더한 첫 페이지 (기본 필터·정렬 기준) */
  initialPage: RecordsPage;
  initialBatches: UploadBatch[];
  initialResetLogs: ResetLog[];
  /** DB 실제 총 건수(진단용). 인덱스 건수와 다르면 조회가 잘린 것 — 경고 표시. */
  dbCount: number | null;
  dbMode: boolean;
}) {
  const router = useRouter();
  // 목록은 서버에서 필터·정렬·페이징을 끝낸 "현재 페이지"만 받는다.
  // (전체 행을 브라우저로 나르던 구조가 조회 상한·페이로드 문제의 원인이었다)
  const [pageData, setPageData] = useState<RecordsPage>(initialPage);
  const [listLoading, setListLoading] = useState(false);
  const [batches, setBatches] = useState<UploadBatch[]>(initialBatches);
  const [resetLogs, setResetLogs] = useState<ResetLog[]>(initialResetLogs);

  useEffect(() => setPageData(initialPage), [initialPage]);
  useEffect(() => setBatches(initialBatches), [initialBatches]);
  useEffect(() => setResetLogs(initialResetLogs), [initialResetLogs]);

  // 검색어는 입력 즉시가 아니라 잠깐 멈춘 뒤 조회한다(타이핑마다 서버 왕복 방지).
  const [searchDraft, setSearchDraft] = useState("");
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
  const [exporting, setExporting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<Satisfaction | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetHistory, setShowResetHistory] = useState(false);
  const [resetting, setResetting] = useState(false);

  const dateRangeInvalid = isDateRangeInvalid(dateFrom, dateTo);

  const params: QueryParams = useMemo(
    () => ({
      search,
      rating,
      reason,
      dateFrom: dateRangeInvalid ? undefined : dateFrom || undefined,
      dateTo: dateRangeInvalid ? undefined : dateTo || undefined,
      sortKey,
      sortDir,
      page,
      pageSize,
    }),
    [search, rating, reason, dateFrom, dateTo, dateRangeInvalid, sortKey, sortDir, page, pageSize],
  );

  // 검색어 디바운스 — 입력이 멈춘 뒤에만 조회 조건에 반영한다.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) {
        setSearch(searchDraft);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  /** 현재 조건으로 서버에서 페이지를 다시 가져온다. */
  const fetchPage = useCallback(async (p: QueryParams) => {
    setListLoading(true);
    try {
      setPageData(await queryRecordsPage(p));
    } catch (e) {
      console.error("목록 조회 실패:", e);
    } finally {
      setListLoading(false);
    }
  }, []);

  // 조건이 바뀌면 해당 페이지만 서버에서 받아온다.
  // 첫 렌더는 서버가 준 initialPage 를 그대로 쓰므로 건너뛴다(중복 조회 방지).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void fetchPage(params);
  }, [params, fetchPage]);

  const displayNo = pageData.displayNo;
  const result = pageData;

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

  /**
   * 내보내기 — 필터 결과 **전체**를 서버에서 청크로 이어 받아 파일로 만든다.
   * 한 번에 다 받으면 응답 크기 한도에 걸릴 수 있어 나눠 받는다.
   */
  async function onExport(format: ExportFormat) {
    if (exporting) return;
    setExporting(true);
    try {
      const flat: Record<string, unknown>[] = [];
      let offset = 0;
      for (;;) {
        const chunk = await exportRecordsChunk(params, offset);
        for (const r of chunk.rows) {
          flat.push({
            no: chunk.displayNo[r.id] ?? r.record_no,
            rating: r.rating,
            reason: r.reason ?? "",
            reason_label: reasonLabel(r.reason),
            query: r.query ?? "",
            summary_text: r.summary_text ?? "",
            comment: r.comment ?? "",
            created_at: r.created_at,
          });
        }
        offset += chunk.rows.length;
        // 빈 청크이거나 전체를 다 받았으면 종료 (무한 루프 방지)
        if (chunk.rows.length === 0 || offset >= chunk.total) break;
        setToast(`내보내기 준비 중… ${offset}/${chunk.total}`);
      }
      setToast(null);
      exportRows(flat, `satisfaction_${new Date().toISOString().slice(0, 10)}`, format);
    } catch (e) {
      setToast(`내보내기 실패 — ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
      setTimeout(() => setToast(null), 6000);
    } finally {
      setExporting(false);
    }
  }

  /**
   * 업로드 — record_key 기준 중복 판단으로 신규 insert / 기존 갱신을 처리한다.
   * 컬럼명 alias/정규화(mapAndValidate)는 파싱 단계에서 이미 적용되어, 컬럼명이 달라도
   * 같은 의미의 값이면 동일 record_key 로 중복 인식된다. device_type/guardrail_label 은
   * 함께 저장되되 record_key(중복 기준)에는 포함되지 않는다.
   *
   * 부수적으로 row별 처리 결과(신규/갱신/파일 내 중복/실패)를 모아 finishUpload 에
   * 전달 → upload_batch_rows 에 일괄 저장한다(사후 SQL 확인용). 화면/집계는 기존과 동일.
   */
  async function onUploadConfirm(
    valid: ParsedSatisfaction[],
    meta: { fileName: string; totalRows: number; failedCount: number },
    failedRows: UploadRowLog[],
  ) {
    setUploading(true);
    try {
      // record_key 기준 파일 내 중복 제거(마지막 값 우선). 밀려난 이전 행 = 파일 내 중복.
      const byKey = new Map<string, ParsedSatisfaction>();
      const duplicateRows: UploadRowLog[] = [];
      for (const r of valid) {
        const prev = byKey.get(r.record_key);
        if (prev) duplicateRows.push(makeDuplicateLog(prev));
        byKey.set(r.record_key, r);
      }
      const unique = Array.from(byKey.values());
      const duplicate = valid.length - unique.length; // = duplicateRows.length

      // 청크로 나눠 순차 전송(대용량 단일 페이로드 회피). raw_row/row_number 는
      // 적재/판단에 불필요하므로 서버 전송 payload 에서 제거(전송량 절감).
      const CHUNK = 1000;
      let inserted = 0; // 신규 추가
      let updated = 0; // record_key 일치 기존 갱신
      const resultByKey = new Map<
        string,
        {
          action: "insert" | "update";
          satisfaction_id: string | null;
          device_type_before: string | null;
          guardrail_label_before: string | null;
        }
      >();
      for (let i = 0; i < unique.length; i += CHUNK) {
        const payload = unique
          .slice(i, i + CHUNK)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .map(({ raw_row, row_number, ...rest }) => rest);
        const res = await appendSatisfactionRows(payload);
        if (!res.ok) {
          setToast(`업로드 실패 — ${res.error ?? "알 수 없는 오류"}`);
          setTimeout(() => setToast(null), 6000);
          return;
        }
        inserted += res.inserted ?? 0;
        updated += res.updated ?? 0;
        for (const rr of res.results ?? []) {
          resultByKey.set(rr.record_key, {
            action: rr.action,
            satisfaction_id: rr.satisfaction_id,
            device_type_before: rr.device_type_before,
            guardrail_label_before: rr.guardrail_label_before,
          });
        }
        setToast(`업로드 중… ${Math.min(i + CHUNK, unique.length)}/${unique.length}`);
      }

      // 신규/갱신 row 로그 — 서버 결과(record_key 기준)를 원본 행과 조인해 구성.
      const insertUpdateRows: UploadRowLog[] = unique.map((r) => {
        const res = resultByKey.get(r.record_key);
        const action = res?.action ?? "insert";
        return {
          row_number: r.row_number ?? 0,
          action,
          record_key: r.record_key,
          satisfaction_id: res?.satisfaction_id ?? null,
          query: r.query,
          rating: r.rating,
          reason: r.reason,
          comment: r.comment,
          summary_text: r.summary_text,
          feedback_created_at: r.created_at,
          device_type: r.device_type,
          guardrail_label: r.guardrail_label,
          device_type_before: action === "update" ? res?.device_type_before ?? null : null,
          device_type_after: action === "update" ? r.device_type : null,
          guardrail_label_before:
            action === "update" ? res?.guardrail_label_before ?? null : null,
          guardrail_label_after: action === "update" ? r.guardrail_label : null,
          error_message: null,
          raw_row: r.raw_row ?? null,
        };
      });

      // 파일 내 중복 row 의 satisfaction_id 는 최종 반영된 동일 key 행의 id 로 보강.
      for (const d of duplicateRows) {
        if (d.record_key) {
          d.satisfaction_id = resultByKey.get(d.record_key)?.satisfaction_id ?? null;
        }
      }

      const rowLogs: UploadRowLog[] = [
        ...insertUpdateRows,
        ...duplicateRows,
        ...failedRows,
      ];

      const fin = await finishUpload(meta, { inserted, updated, duplicate }, rowLogs);
      if (!fin.ok || !fin.summary) {
        setToast(`업로드 실패 — ${fin.error ?? "알 수 없는 오류"}`);
        setTimeout(() => setToast(null), 6000);
        return;
      }
      setShowUpload(false);
      setPage(1);
      setToast(
        `적재 완료 — 신규 ${inserted} · 갱신 ${updated} · 파일 내 중복 ${duplicate} · 실패 ${meta.failedCount}`,
      );
      setTimeout(() => setToast(null), 5000);
      // 목록은 서버에서 다시 받아 즉시 갱신하고, 업로드 이력 등 나머지는 refresh 로 동기화한다.
      await fetchPage({ ...params, page: 1 });
      router.refresh();
    } catch (e) {
      setToast(`업로드 실패 — ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
      setTimeout(() => setToast(null), 6000);
    } finally {
      setUploading(false);
    }
  }

  function resetFilters() {
    setSearchDraft("");
    setSearch("");
    setRating("all");
    setReason("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  async function onResetData() {
    setResetting(true);
    try {
      const res = await resetData();
      if (!res.ok) {
        setToast(`초기화 실패 — ${res.error ?? "알 수 없는 오류"}`);
        setTimeout(() => setToast(null), 6000);
        return;
      }
      setShowResetConfirm(false);
      setPage(1);
      // 서버 재조회(router.refresh)를 기다리지 않고 화면 상태를 즉시 비운다.
      // → 평가 표·"최근 업로드 이력"(upload_batches) 영역이 곧바로 0건/빈 상태로 보인다.
      setPageData({
        rows: [],
        displayNo: {},
        total: 0,
        totalPages: 1,
        page: 1,
        indexCount: 0,
      });
      setBatches([]);
      setToast("모든 데이터를 초기화했습니다.");
      setTimeout(() => setToast(null), 4000);
      // 서버와 최종 동기화(+ 새 초기화 이력 반영)
      router.refresh();
    } finally {
      setResetting(false);
    }
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
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
          데이터 조회
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            aria-label="데이터 초기화 이력"
            title="데이터 초기화 이력"
            onClick={() => setShowResetHistory(true)}
            style={{
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#3a4150",
              background: "transparent",
              border: "none",
              borderRadius: 9,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              color: "#e0635d",
              background: "#fff",
              border: "1px solid #f0c4c1",
              borderRadius: 9,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            데이터 초기화
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* 조회 누락 경고 — DB 실제 건수와 서버가 읽어온 인덱스 건수가 다르면 즉시 알린다.
          (조회가 조용히 잘려 데이터가 없어진 것처럼 보이는 사고를 막기 위한 안전장치) */}
      {dbCount !== null && dbCount !== pageData.indexCount && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            color: "#a13d38",
            background: "#fdecea",
            border: "1px solid #f0c4c1",
            borderRadius: 10,
          }}
        >
          <span aria-hidden="true">⚠️</span>
          <span>
            조회 누락 — DB에는 {dbCount.toLocaleString()}건이 있는데 조회된 건{" "}
            {pageData.indexCount.toLocaleString()}건뿐입니다. 새로고침해도 같으면
            담당자에게 알려주세요.
          </span>
        </div>
      )}

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
        <button style={exportBtn} onClick={() => onExport("csv")} disabled={exporting}>
          {exporting ? "내보내는 중…" : "CSV 내보내기"}
        </button>
        <button style={exportBtn} onClick={() => onExport("xlsx")} disabled={exporting}>
          {exporting ? "내보내는 중…" : "XLSX 내보내기"}
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
            style={searchInputStyle}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
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
              minWidth: 1040,
            }}
          >
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "13%" }} />
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
                  평가일시{" "}
                  <span style={{ color: noSort.color, fontSize: 10 }}>
                    {noSort.arrow}
                  </span>
                </th>
                <th style={th}>질의어</th>
                <th style={th}>AI 답변</th>
                <th style={th}>평가</th>
                <th style={th}>평가 사유</th>
                <th style={th}>의견</th>
              </tr>
            </thead>
            {/* 조회 중에는 표를 살짝 흐리게 — 이전 페이지가 남아 깜빡임이 없다 */}
            <tbody style={{ opacity: listLoading ? 0.55 : 1, transition: "opacity .15s" }}>
              {listLoading && result.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, padding: 44, color: "#9aa1ad" }}>
                    불러오는 중…
                  </td>
                </tr>
              ) : result.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, padding: 44, color: "#9aa1ad" }}>
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                result.rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    style={{ borderBottom: "1px solid #f1f3f5", cursor: "pointer" }}
                  >
                    <td style={{ ...td, color: "#6b7280", fontWeight: 500 }}>
                      {displayNo[r.id] ?? r.record_no}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {formatKstDateTime(r.created_at)}
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
                    <td style={td}>
                      <RatingBadge rating={r.rating} />
                    </td>
                    <td
                      style={{ ...tdEllipsis, color: r.reason ? "#5a616e" : "#9aa1ad" }}
                      title={r.reason ? reasonLabel(r.reason) : undefined}
                    >
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

      {detail && (
        <RecordDetailDialog
          row={detail}
          no={displayNo[detail.id] ?? detail.record_no}
          onClose={() => setDetail(null)}
        />
      )}

      {showResetConfirm && (
        <div
          onClick={() => !resetting && setShowResetConfirm(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(16,24,40,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(16,24,40,.3)",
              padding: 28,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
              데이터 초기화
            </h2>
            <p style={{ margin: "0 0 22px", fontSize: 14, lineHeight: 1.6, color: "#5a616e" }}>
              업로드된 평가·피드백·업로드 이력이 <strong>모두 삭제</strong>됩니다.
              이 작업은 <strong>되돌릴 수 없습니다.</strong> 계속할까요?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                style={{
                  height: 42,
                  padding: "0 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  color: "#5a616e",
                  background: "#fff",
                  border: "1px solid #e2e5ea",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={onResetData}
                disabled={resetting}
                style={{
                  height: 42,
                  padding: "0 22px",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  color: "#fff",
                  background: "#e0635d",
                  border: "none",
                  borderRadius: 10,
                  cursor: resetting ? "not-allowed" : "pointer",
                  opacity: resetting ? 0.7 : 1,
                }}
              >
                {resetting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetHistory && (
        <div
          onClick={() => setShowResetHistory(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(16,24,40,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 620,
              maxHeight: "80vh",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(16,24,40,.3)",
              padding: 28,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
                데이터 초기화 이력
              </h2>
              <CloseButton onClick={() => setShowResetHistory(false)} />
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8a909c" }}>
              데이터 초기화 이력을 최신순으로 확인할 수 있습니다.
            </p>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {resetLogs.length === 0 ? (
                <p style={{ margin: 0, padding: "28px 0", textAlign: "center", color: "#9aa1ad", fontSize: 13 }}>
                  초기화 이력이 없습니다.
                </p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f7f8fa" }}>
                      <th style={stickyTh}>No.</th>
                      <th style={stickyTh}>초기화 일시</th>
                      <th style={stickyTh}>이름</th>
                      <th style={stickyTh}>삭제 데이터 건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetLogs.slice(0, 20).map((log, i) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                        <td style={{ ...td, color: "#6b7280", fontWeight: 500 }}>
                          {i + 1}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {formatKstDateTime(log.reset_at)}
                        </td>
                        <td style={td}>{log.reset_by ?? "-"}</td>
                        <td style={td}>
                          {log.satisfaction_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
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
