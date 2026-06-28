"use client";

import { useState } from "react";

// ── 날짜 유틸 (YYYY-MM-DD 문자열 기준) ──
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const toYmd = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function parseYmd(s: string): { y: number; m: number } {
  const [y, m] = s.split("-").map(Number);
  return { y, m: m - 1 };
}

/**
 * 기간 선택 달력 팝오버 (디자인 기준 + 월 이동).
 * from/to 는 YYYY-MM-DD. 빈 문자열("")이면 "필터 없음"으로 취급한다.
 * "적용" 시 onChange(from, to) 로 커밋. 선택 없이 적용하면 빈 값으로 초기화.
 */
export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<string | null>(from || null);
  const [draftTo, setDraftTo] = useState<string | null>(to || null);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = to || from;
    if (base) return parseYmd(base);
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  function openCal() {
    setDraftFrom(from || null);
    setDraftTo(to || null);
    const base = to || from;
    if (base) setView(parseYmd(base));
    setOpen(true);
  }

  function clickDay(ds: string) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(ds);
      setDraftTo(null);
    } else if (ds >= draftFrom) {
      setDraftTo(ds);
    } else {
      setDraftFrom(ds);
      setDraftTo(null);
    }
  }

  function apply() {
    if (!draftFrom) onChange("", "");
    else onChange(draftFrom, draftTo || draftFrom);
    setOpen(false);
  }

  function resetDraft() {
    setDraftFrom(null);
    setDraftTo(null);
  }

  function prevMonth() {
    setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  }
  function nextMonth() {
    setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  }

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const navBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    border: "none",
    background: "transparent",
    color: "#5a616e",
    fontSize: 15,
    cursor: "pointer",
    borderRadius: 7,
    fontFamily: "Pretendard, sans-serif",
  };

  return (
    <div style={{ position: "relative" }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 55 }}
        />
      )}

      {/* 트리거 */}
      <div
        onClick={() => (open ? setOpen(false) : openCal())}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 42,
          padding: "0 14px",
          border: `1px solid ${open ? "#2f6bff" : "#e2e5ea"}`,
          borderRadius: 10,
          background: "#fff",
          cursor: "pointer",
          fontSize: 13,
          color: "#3a4150",
          userSelect: "none",
        }}
      >
        <span style={{ color: from ? "#3a4150" : "#9aa1ad" }}>
          {from || "시작일"}
        </span>
        <span style={{ color: "#b0b6c0" }}>~</span>
        <span style={{ color: to ? "#3a4150" : "#9aa1ad" }}>{to || "종료일"}</span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9aa1ad"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ marginLeft: 2 }}
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      </div>

      {/* 팝오버 */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 0,
            zIndex: 60,
            width: 276,
            background: "#fff",
            border: "1px solid #e9ebef",
            borderRadius: 12,
            boxShadow: "0 10px 28px rgba(16,24,40,.14)",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <button style={navBtn} onClick={prevMonth} aria-label="이전 달">
              ‹
            </button>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1d23" }}>
              {view.y}년 {view.m + 1}월
            </div>
            <button style={navBtn} onClick={nextMonth} aria-label="다음 달">
              ›
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              marginBottom: 4,
            }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: "#9aa1ad",
                  padding: "4px 0",
                }}
              >
                {w}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
            }}
          >
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const ds = toYmd(view.y, view.m, d);
              const isStart = ds === draftFrom;
              const isEnd = ds === draftTo;
              const selected = isStart || isEnd;
              const inRange =
                draftFrom && draftTo && ds > draftFrom && ds < draftTo;
              return (
                <div
                  key={ds}
                  onClick={() => clickDay(ds)}
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    height: 32,
                    lineHeight: "32px",
                    borderRadius: 7,
                    cursor: "pointer",
                    color: selected ? "#fff" : inRange ? "#2f6bff" : "#3a4150",
                    background: selected
                      ? "#2f6bff"
                      : inRange
                        ? "#eef3ff"
                        : "transparent",
                    fontWeight: selected ? 700 : 500,
                  }}
                >
                  {d}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              onClick={resetDraft}
              style={{
                height: 36,
                padding: "0 14px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "Pretendard, sans-serif",
                color: "#5a616e",
                background: "#fff",
                border: "1px solid #e2e5ea",
                borderRadius: 9,
                cursor: "pointer",
              }}
            >
              초기화
            </button>
            <button
              onClick={apply}
              style={{
                height: 36,
                padding: "0 16px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "Pretendard, sans-serif",
                color: "#fff",
                background: "#2f6bff",
                border: "none",
                borderRadius: 9,
                cursor: "pointer",
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
