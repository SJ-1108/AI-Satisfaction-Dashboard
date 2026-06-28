"use client";

import { useState } from "react";

export type DropdownOption = { label: string; value: string };

/**
 * 커스텀 드롭다운(셀렉트) — 디자인 톤. 네이티브 select 대체.
 * 트리거 박스 클릭 → 옵션 팝오버 → 선택 시 onChange.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  width = 132,
  openUp = false,
  ariaLabel,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  width?: number;
  openUp?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 55 }}
        />
      )}

      <div
        role="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          width,
          height: 42,
          padding: "0 12px",
          fontSize: 13,
          color: "#3a4150",
          background: "#fff",
          border: `1px solid ${open ? "#2f6bff" : "#e2e5ea"}`,
          borderRadius: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span>{selected?.label ?? value}</span>
        <span style={{ color: "#9aa1ad", fontSize: 9 }}>▼</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            [openUp ? "bottom" : "top"]: 48,
            left: 0,
            zIndex: 60,
            minWidth: width,
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 6,
          }}
        >
          {options.map((o) => {
            const isSel = o.value === value;
            return (
              <div
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setHovered(o.value)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: "9px 12px",
                  borderRadius: 7,
                  cursor: "pointer",
                  fontSize: 13,
                  color: isSel ? "#2f6bff" : "#3a4150",
                  fontWeight: isSel ? 700 : 500,
                  background: hovered === o.value ? "#f3f5f9" : "transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
