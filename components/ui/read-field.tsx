/** 읽기 전용 필드 박스 (라벨 + 내용, 줄바꿈 허용). 상세/피드백 모달 공용. */
export default function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
