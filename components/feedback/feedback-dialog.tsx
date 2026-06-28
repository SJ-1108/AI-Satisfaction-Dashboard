"use client";

import { useState } from "react";
import { reasonLabel } from "@/lib/reasons";
import type { FeedbackRow, FeedbackEdit } from "@/lib/data/feedback-view";

/** 원인 분류 프리셋 (단순화 디자인 — 칩 선택) */
const CAUSE_PRESETS = ["데이터 부족", "오답·사실 오류", "질의 의도 불일치", "기타"];

/**
 * 피드백 편집 모달 (FR-4.2 / FR-4.3) — 디자인 단순화 버전.
 * 원인 분류(칩) + 피드백 내용(조치 내용)만 입력. 진행 상태는 목록에서 인라인 변경한다.
 * 상세사유·메모 등 기존 값은 보존하여 저장한다(데이터 손실 없음).
 */
export default function FeedbackDialog({
  row,
  currentUserName,
  saving,
  onSave,
  onClose,
}: {
  row: FeedbackRow;
  currentUserName: string;
  saving: boolean;
  onSave: (edit: FeedbackEdit) => void;
  onClose: () => void;
}) {
  const [cause, setCause] = useState<string | null>(row.cause_category ?? null);
  const [content, setContent] = useState(row.action ?? "");

  // 기존 값이 프리셋에 없으면 칩으로 추가해 선택 상태를 유지
  const causeChips = Array.from(
    new Set([...CAUSE_PRESETS, ...(row.cause_category ? [row.cause_category] : [])]),
  );

  function submit() {
    onSave({
      satisfaction_id: row.satisfaction_id,
      status: row.status, // 상태는 목록 인라인에서 변경 (여기선 유지)
      detail_reason: row.detail_reason, // 기존 값 보존
      cause_category: cause,
      action: content.trim() || null,
      memo: row.memo, // 기존 값 보존
    });
  }

  return (
    <div
      onClick={onClose}
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
          maxWidth: 520,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(16,24,40,.3)",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
              피드백 입력
            </h2>
            <div style={{ fontSize: 12, color: "#9aa1ad" }}>
              No. {row.record_no} · 작성자 자동 기록
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "#9aa1ad",
              fontSize: 16,
              cursor: "pointer",
              borderRadius: 7,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 질의어 + 평가 사유 (읽기 전용) */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, padding: "12px 14px", background: "#f7f8fa", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#9aa1ad", marginBottom: 4 }}>질의어</div>
              <div style={{ fontSize: 13, color: "#3a4150", wordBreak: "break-all" }}>
                {row.query ?? "-"}
              </div>
            </div>
            <div style={{ width: 150, padding: "12px 14px", background: "#f7f8fa", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "#9aa1ad", marginBottom: 4 }}>평가 사유</div>
              <div style={{ fontSize: 13, color: "#3a4150" }}>
                {row.reason ? reasonLabel(row.reason) : "-"}
              </div>
            </div>
          </div>

          {/* 원인 분류 (칩) */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              원인 분류
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {causeChips.map((label) => {
                const sel = cause === label;
                return (
                  <div
                    key={label}
                    onClick={() => setCause(sel ? null : label)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "9px 16px",
                      border: `1px solid ${sel ? "#2f6bff" : "#e2e5ea"}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      color: sel ? "#fff" : "#3a4150",
                      background: sel ? "#2f6bff" : "#fff",
                      userSelect: "none",
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 피드백 내용 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              피드백 내용
            </div>
            <textarea
              placeholder="처리 내용 또는 메모를 입력하세요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: "100%",
                height: 110,
                padding: "12px 14px",
                fontSize: 13,
                fontFamily: "Pretendard, sans-serif",
                color: "#1a1d23",
                border: "1px solid #e2e5ea",
                borderRadius: 10,
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 작성자 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7280" }}>
            <span style={{ fontWeight: 600, color: "#3a4150" }}>작성자</span>
            <span>{currentUserName}</span>
            <span style={{ fontSize: 12, color: "#9aa1ad" }}>(자동 기록)</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: 42,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "Pretendard, sans-serif",
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
            onClick={submit}
            disabled={saving}
            style={{
              height: 42,
              padding: "0 22px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "Pretendard, sans-serif",
              color: "#fff",
              background: "#2f6bff",
              border: "none",
              borderRadius: 10,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
