"use client";

import { reasonLabel } from "@/lib/reasons";
import { formatKstDateTime } from "@/lib/format-date";
import type { Satisfaction } from "@/lib/types";

/** 데이터 조회 — 한 건의 전체 내용 보기(읽기 전용) 모달. */
export default function RecordDetailDialog({
  row,
  no,
  onClose,
}: {
  row: Satisfaction;
  no: number | string;
  onClose: () => void;
}) {
  const up = row.rating === "up";
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
          maxWidth: 560,
          maxHeight: "85vh",
          overflowY: "auto",
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
              상세보기
            </h2>
            <div style={{ fontSize: 12, color: "#9aa1ad" }}>
              No. {no} · {formatKstDateTime(row.created_at)}
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
          <Field label="질의어">{row.query ?? "-"}</Field>
          <Field label="AI 답변">{row.summary_text ?? "-"}</Field>
          <Field label="평가">
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
          </Field>
          <Field label="사유">{row.reason ? reasonLabel(row.reason) : "-"}</Field>
          <Field label="의견">{row.comment ?? "-"}</Field>
        </div>
      </div>
    </div>
  );
}

/** 라벨 + 내용 블록 (전체 텍스트, 줄바꿈 허용) */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 14px", background: "#f7f8fa", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "#9aa1ad", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: "#3a4150",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}
