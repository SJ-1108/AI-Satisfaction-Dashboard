"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 검색형 콤보박스(자동완성 + ▾ 드롭다운 버튼).
 * 타이핑하면 부분일치로 후보가 뜨고, ▾ 버튼을 누르면 전체 목록이 열린다.
 * 고정 목록(options)만 허용: 목록에 없는 자유 입력은 blur 시 되돌린다.
 *
 * 선택 시 입력창을 value(부모가 넘긴 값)로 초기화한다.
 * - value=""(항상 빈 값)로 쓰면 "선택→초기화" 피커가 되어 복수 선택(칩 누적)에 쓸 수 있다.
 * - value 를 상태로 유지하면 단일 선택 콤보박스로 동작한다(아래 value 동기화 effect).
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
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    // 선택 후 입력창을 value 로 초기화. 피커 모드(value="")는 비워지고,
    // 단일 선택 모드는 부모가 value 를 갱신하면 아래 effect 가 다시 채운다.
    setText(value);
    setOpen(false);
  }

  function commitOnBlur() {
    setOpen(false);
    const exact = options.find((o) => o === text.trim());
    if (exact) onChange(exact); // 정확히 일치하면 확정/추가
    setText(value); // 자유 입력·미확정은 이전 상태로 되돌린다
  }

  return (
    <div style={{ position: "relative", width }}>
      <input
        ref={inputRef}
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
          padding: "0 36px 0 12px",
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

      {/* 드롭다운 토글 화살표 (클릭 시 전체 목록 열기/닫기) */}
      <button
        type="button"
        aria-label={open ? "목록 닫기" : "목록 열기"}
        tabIndex={-1}
        // input blur 보다 먼저 처리해 포커스가 유지되도록 mousedown 사용
        onMouseDown={(e) => {
          e.preventDefault();
          if (blurTimer.current) clearTimeout(blurTimer.current);
          if (open) {
            setOpen(false);
          } else {
            setText(value); // 열 때는 전체 목록이 보이도록 검색어 초기화
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 34,
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#9aa1ad",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .15s",
          }}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

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
            // 항목 3개 높이(약 34px/개)만 노출하고 나머지는 스크롤
            maxHeight: 118,
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
