/**
 * 메뉴 전환 시 즉시 표시되는 로딩 폴백 (Suspense).
 * 서버 컴포넌트(페이지) 데이터가 준비되기 전까지 빈 화면 대신 스켈레톤을 보여
 * 클릭 직후 반응이 없어 보이는 체감 지연을 줄인다.
 */
export default function Loading() {
  return (
    <div style={{ padding: "4px 2px" }}>
      <div
        style={{
          width: 180,
          height: 26,
          borderRadius: 8,
          background: "#eef0f3",
          marginBottom: 28,
        }}
        className="skeleton-pulse"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 96,
              borderRadius: 14,
              background: "#f3f4f7",
              border: "1px solid #eceef1",
            }}
            className="skeleton-pulse"
          />
        ))}
      </div>
      <div
        style={{
          height: 320,
          borderRadius: 14,
          background: "#f3f4f7",
          border: "1px solid #eceef1",
        }}
        className="skeleton-pulse"
      />
    </div>
  );
}
