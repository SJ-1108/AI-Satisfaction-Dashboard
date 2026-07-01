"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 인라인 콤보박스(자동완성) — 드롭다운 버튼 없이 텍스트 입력창을 그대로 노출한다.
 * 타이핑하면 label 부분일치로 후보가 아래에 뜨고, 클릭/선택하면 값이 확정된다.
 * 고정 목록(options)만 허용: 목록에 없는 자유 입력은 blur 시 이전 값으로 되돌린다.
 * 입력창을 비우고 포커스를 벗어나면 미선택("")으로 처리한다.
 */
export default function Combobox({
  value,
  options,
  onChange,
  width = "100%",
  placeholder = "부서명 검색",
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  width?: number | string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 외부 value 변경 시 입력 텍스트 동기화
  useEffect(() => {
    setText(value);
  }, [value]);

  const q = text.trim().toLowerCase();
  // 방금 열려 입력값이 선택값과 같으면 전체 목록을, 타이핑 중이면 부분일치만 노출
  const filtered =
    q && text !== value
      ? options.filter((o) => o.toLowerCase().includes(q))
      : options;

  function select(opt: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(opt);
    setText(opt);
    setOpen(false);
  }

  function commitOnBlur() {
    setOpen(false);
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(""); // 비우면 미선택
      return;
    }
    const exact = options.find((o) => o === trimmed);
    if (exact) onChange(exact);
    else setText(value); // 목록에 없는 자유 입력은 되돌린다
  }

  return (
    <div style={{ position: "relative", width }}>
      <input
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 후보 클릭(mousedown) 처리가 끝난 뒤 커밋되도록 지연
          blurTimer.current = setTimeout(commitOnBlur, 120);
        }}
        style={{
          width: "100%",
          height: 42,
          padding: "0 12px",
          fontSize: 13,
          fontFamily: "Pretendard, sans-serif",
          color: "#3a4150",
          background: "#fff",
          border: `1px solid ${open ? "#2f6bff" : "#e2e5ea"}`,
          borderRadius: 10,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {open && (
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 0,
            zIndex: 60,
            width: "100%",
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 6,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "9px 12px", fontSize: 13, color: "#9aa1ad" }}>
              검색 결과 없음
            </div>
          ) : (
            filtered.map((o) => {
              const isSel = o === value;
              return (
                <div
                  key={o}
                  // onClick 이전에 input blur 가 먼저 나지 않도록 mousedown 에서 처리
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(o);
                  }}
                  onMouseEnter={() => setHovered(o)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 13,
                    color: isSel ? "#2f6bff" : "#3a4150",
                    fontWeight: isSel ? 700 : 500,
                    background: hovered === o ? "#f3f5f9" : "transparent",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
