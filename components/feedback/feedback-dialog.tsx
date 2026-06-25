"use client";

import { useState } from "react";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/types";
import { reasonLabel } from "@/lib/reasons";
import type { FeedbackRow, FeedbackEdit } from "@/lib/data/feedback-view";

/**
 * 피드백 편집 모달 (FR-4.2 / FR-4.3).
 * 상세사유·원인분류·조치내용·메모·진행상태를 입력/수정한다.
 * 작성자(created_by)·수정자(updated_by)는 저장 시 상위에서 자동 기록한다.
 */
export default function FeedbackDialog({
  row,
  saving,
  onSave,
  onClose,
}: {
  row: FeedbackRow;
  saving: boolean;
  onSave: (edit: FeedbackEdit) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(row.status);
  const [detailReason, setDetailReason] = useState(row.detail_reason ?? "");
  const [causeCategory, setCauseCategory] = useState(row.cause_category ?? "");
  const [action, setAction] = useState(row.action ?? "");
  const [memo, setMemo] = useState(row.memo ?? "");

  function submit() {
    onSave({
      satisfaction_id: row.satisfaction_id,
      status,
      detail_reason: detailReason.trim() || null,
      cause_category: causeCategory.trim() || null,
      action: action.trim() || null,
      memo: memo.trim() || null,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>불만족 피드백 — No.{row.record_no}</h2>
          <button className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        {/* 평가 원본 요약 (읽기 전용) */}
        <div className="fb-origin">
          <div className="fb-origin-row">
            <span className="fb-origin-label">검색어</span>
            <span>{row.query ?? "-"}</span>
          </div>
          <div className="fb-origin-row">
            <span className="fb-origin-label">AI 요약</span>
            <span>{row.summary_text ?? "-"}</span>
          </div>
          <div className="fb-origin-row">
            <span className="fb-origin-label">평가 사유</span>
            <span>{row.reason ? reasonLabel(row.reason) : "-"}</span>
          </div>
          <div className="fb-origin-row">
            <span className="fb-origin-label">사용자 의견</span>
            <span>{row.comment ?? "-"}</span>
          </div>
        </div>

        {/* 입력 폼 */}
        <div className="field">
          <label>진행 상태 (FR-4.3)</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          >
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>상세 사유</label>
          <input
            className="input"
            value={detailReason}
            placeholder="불만족의 구체적 원인"
            onChange={(e) => setDetailReason(e.target.value)}
          />
        </div>

        <div className="field">
          <label>원인 분류</label>
          <input
            className="input"
            value={causeCategory}
            placeholder="예: 데이터 부족 / 오답·사실 오류 / 질의 의도 불일치"
            onChange={(e) => setCauseCategory(e.target.value)}
          />
        </div>

        <div className="field">
          <label>조치 내용</label>
          <textarea
            className="input"
            rows={3}
            value={action}
            placeholder="수행했거나 예정인 조치"
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        <div className="field">
          <label>메모</label>
          <textarea
            className="input"
            rows={2}
            value={memo}
            placeholder="내부 참고 메모"
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {/* 작성 이력 (읽기 전용) */}
        {row.hasFeedback && (
          <p className="fb-meta">
            작성자 <strong>{row.created_by ?? "-"}</strong> · 최종수정{" "}
            <strong>{row.updated_by ?? "-"}</strong>
            {row.updated_at
              ? ` (${row.updated_at.slice(0, 16).replace("T", " ")})`
              : ""}
          </p>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="btn-primary inline" onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
