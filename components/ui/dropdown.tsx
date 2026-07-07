"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DropdownOption = { label: string; value: string };

/**
 * 커스텀 드롭다운(셀렉트) — 디자인 톤. 네이티브 select 대체.
 * 트리거 박스 클릭 → 옵션 팝오버 → 선택 시 onChange.
 *
 * searchable=true 이면 콤보박스처럼 동작: 팝오버 상단에 검색 인풋이 생기고
 * 옵션 목록은 maxHeight+스크롤. 옵션이 많은 필터(예: 유관 부서)에 사용한다.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  width = 132,
  openUp = false,
  ariaLabel,
  searchable = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  width?: number;
  openUp?: boolean;
  ariaLabel?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  // 팝오버 열 때마다 검색어 초기화 + 검색 인풋 포커스
  useEffect(() => {
    if (open) {
      setQuery("");
      if (searchable) searchRef.current?.focus();
    }
  }, [open, searchable]);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const close = () => setOpen(false);
  const pick = (v: string) => {
    onChange(v);
    close();
  };

  return (
    <div style={{ position: "relative" }}>
      {open && (
        <div
          onClick={close}
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
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected?.label ?? value}
        </span>
        <span style={{ color: "#9aa1ad", fontSize: 9, marginLeft: 6 }}>▼</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            [openUp ? "bottom" : "top"]: 48,
            left: 0,
            zIndex: 60,
            // 콤보박스(searchable)는 팝오버 폭을 트리거와 동일하게 고정,
            // 일반 드롭다운은 내용에 맞춰 트리거 폭 이상으로 넓어지게(minWidth).
            ...(searchable ? { width } : { minWidth: width }),
            boxSizing: "border-box",
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 6,
          }}
        >
          {searchable && (
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                // Enter → 첫 번째 결과 선택
                if (e.key === "Enter" && filtered[0]) pick(filtered[0].value);
              }}
              placeholder="부서 검색"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 34,
                padding: "0 10px",
                marginBottom: 6,
                fontSize: 13,
                color: "#3a4150",
                border: "1px solid #e2e5ea",
                borderRadius: 8,
                outline: "none",
              }}
            />
          )}

          <div
            style={
              searchable
                ? { maxHeight: 260, overflowY: "auto" }
                : undefined
            }
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "9px 12px",
                  fontSize: 13,
                  color: "#9aa1ad",
                  whiteSpace: "nowrap",
                }}
              >
                결과 없음
              </div>
            ) : (
              filtered.map((o) => {
                const isSel = o.value === value;
                return (
                  <div
                    key={o.value}
                    onClick={() => pick(o.value)}
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
                      // 고정폭(searchable)에선 긴 부서명이 잘리지 않게 줄바꿈(어절 단위)
                      whiteSpace: searchable ? "normal" : "nowrap",
                      wordBreak: searchable ? "keep-all" : "normal",
                    }}
                  >
                    {o.label}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
