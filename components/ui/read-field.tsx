/** 읽기 전용 필드 박스 (라벨 + 내용, 줄바꿈 허용). 상세/피드백 모달 공용. */
export default function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "12px 14px", background: "var(--panel-alt)", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted-3)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-2)",
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
