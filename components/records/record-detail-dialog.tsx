"use client";

import { reasonLabel } from "@/lib/reasons";
import { formatKstDateTime } from "@/lib/format-date";
import type { Satisfaction } from "@/lib/types";
import ReadField from "@/components/ui/read-field";
import CloseButton from "@/components/ui/close-button";

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
          <CloseButton onClick={onClose} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ReadField label="질의어">{row.query ?? "-"}</ReadField>
          <ReadField label="AI 답변">{row.summary_text ?? "-"}</ReadField>
          <ReadField label="평가">
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
          </ReadField>
          <ReadField label="평가 사유">{row.reason ? reasonLabel(row.reason) : "-"}</ReadField>
          <ReadField label="의견">{row.comment ?? "-"}</ReadField>
        </div>
      </div>
    </div>
  );
}
