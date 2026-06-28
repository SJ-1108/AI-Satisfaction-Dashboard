"use client";

/** 번호형 페이지네이션 (이전 · 1 … N · 다음) — 디자인 톤. */
export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const total = Math.max(1, totalPages);
  const set = new Set([1, total, page - 1, page, page + 1]);
  const nums = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const items: (number | "…")[] = [];
  let prev = 0;
  for (const p of nums) {
    if (p - prev > 1) items.push("…");
    items.push(p);
    prev = p;
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= total;

  const navStyle = (disabled: boolean): React.CSSProperties => ({
    height: 36,
    padding: "0 14px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "Pretendard, sans-serif",
    color: disabled ? "#c2c7d0" : "#3a4150",
    background: disabled ? "#f5f6f8" : "#fff",
    border: "1px solid #e2e5ea",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      <button
        disabled={prevDisabled}
        onClick={() => onPage(Math.max(1, page - 1))}
        style={navStyle(prevDisabled)}
      >
        이전
      </button>

      {items.map((it, i) =>
        it === "…" ? (
          <div
            key={`e${i}`}
            style={{
              minWidth: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b0b6c0",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            …
          </div>
        ) : (
          <div
            key={it}
            onClick={() => onPage(it)}
            style={{
              minWidth: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 8px",
              fontSize: 13,
              fontWeight: it === page ? 700 : 600,
              color: it === page ? "#fff" : "#3a4150",
              background: it === page ? "#2f6bff" : "#fff",
              border: it === page ? "none" : "1px solid #e2e5ea",
              borderRadius: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {it}
          </div>
        ),
      )}

      <button
        disabled={nextDisabled}
        onClick={() => onPage(Math.min(total, page + 1))}
        style={navStyle(nextDisabled)}
      >
        다음
      </button>
    </div>
  );
}
