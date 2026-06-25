"use client";

import { useState } from "react";
import {
  mapAndValidate,
  readFileRows,
  type ParseResult,
} from "@/lib/ingest/parse-satisfaction";
import { reasonLabel } from "@/lib/reasons";
import type { ParsedSatisfaction } from "@/lib/types";

/**
 * 수동 업로드 모달 (FR-1.2).
 * 파일 선택 → 파싱·자동매핑·검증 → 미리보기 → 확정 시 onConfirm 으로
 * 검증 통과 행(valid)과 파일 통계(meta)를 전달한다.
 * search_event_id 없이 record_key 로 중복을 판별한다.
 */
export default function UploadDialog({
  dbMode,
  uploading,
  onConfirm,
  onClose,
}: {
  dbMode: boolean;
  uploading: boolean;
  onConfirm: (
    valid: ParsedSatisfaction[],
    meta: { fileName: string; totalRows: number; failedCount: number },
  ) => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);
    setParsing(true);
    try {
      const rows = await readFileRows(file);
      if (rows.length === 0) {
        setError("빈 파일이거나 데이터 행이 없습니다.");
      } else {
        setResult(mapAndValidate(rows));
      }
    } catch (err) {
      setError(
        "파일을 읽지 못했습니다. CSV 또는 XLSX 형식인지 확인하세요. " +
          (err instanceof Error ? err.message : ""),
      );
    } finally {
      setParsing(false);
    }
  }

  const preview = result?.valid.slice(0, 5) ?? [];
  const requiredMissing = result?.requiredMissing ?? [];
  const canConfirm =
    (result?.valid.length ?? 0) > 0 && requiredMissing.length === 0 && !uploading;

  function confirm() {
    if (!result) return;
    onConfirm(result.valid, {
      fileName: fileName || "upload",
      totalRows: result.totalRows,
      failedCount: result.errors.length,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>데이터 업로드 (CSV / XLSX)</h2>
          <button className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="page-desc">
          필수 컬럼: <code>query</code>, <code>summary_text</code>,{" "}
          <code>rating</code>, <code>created_at</code> · 권장: <code>reason</code>,{" "}
          <code>comment</code>. 같은 내용(record_key)은 갱신되어{" "}
          <strong>중복 적재되지 않으며</strong>, 기존 데이터는 유지(누적)됩니다.
          {dbMode ? " (실제 DB 저장)" : " (더미 모드 — 세션 메모리)"}
        </p>

        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
        {fileName && <span className="file-name">{fileName}</span>}

        {parsing && <p className="page-desc">파싱 중…</p>}
        {error && <p className="error-msg">{error}</p>}

        {result && (
          <div className="upload-summary">
            {/* 필수 컬럼 누락 → 업로드 차단 */}
            {requiredMissing.length > 0 && (
              <p className="error-msg">
                필수 컬럼 누락: {requiredMissing.join(", ")} — 업로드할 수 없습니다.
              </p>
            )}

            <div className="counts">
              <span>총 {result.totalRows}행</span>
              <span className="ok">유효 {result.valid.length}</span>
              <span className="bad">오류 {result.errors.length}</span>
              <span>파일내 중복 {result.duplicateInFile}</span>
            </div>

            {/* 컬럼 자동 매핑 결과 */}
            <details>
              <summary>컬럼 매핑 결과</summary>
              <ul className="mapping-list">
                {Object.entries(result.mapping).map(([field, header]) => (
                  <li key={field}>
                    <code>{field}</code> →{" "}
                    {header ? (
                      <strong>{header}</strong>
                    ) : (
                      <span className="bad">매칭 없음</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>

            {/* 오류 목록 */}
            {result.errors.length > 0 && (
              <details>
                <summary className="bad">
                  오류 {result.errors.length}건 (해당 행은 적재 제외)
                </summary>
                <ul className="error-list">
                  {result.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      {e.row}행: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 20 && <li>… 외 다수</li>}
                </ul>
              </details>
            )}

            {/* 미리보기 */}
            {preview.length > 0 && (
              <div className="preview">
                <div className="preview-title">미리보기 (최대 5행)</div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>rating</th>
                      <th>reason</th>
                      <th>created_at</th>
                      <th>query</th>
                      <th>summary_text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.record_key}>
                        <td>
                          <span className={`badge ${r.rating}`}>
                            {r.rating === "up" ? "👍 up" : "👎 down"}
                          </span>
                        </td>
                        <td>{reasonLabel(r.reason)}</td>
                        <td>{r.created_at.slice(0, 16).replace("T", " ")}</td>
                        <td className="ellipsis">{r.query}</td>
                        <td className="ellipsis">{r.summary_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose} disabled={uploading}>
                취소
              </button>
              <button
                className="btn-primary inline"
                disabled={!canConfirm}
                onClick={confirm}
              >
                {uploading ? "적재 중…" : `${result.valid.length}건 적재`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
