/** 모달 닫기(✕) 버튼. 모든 모달 공용. */
export default function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="닫기"
      style={{
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        color: "#9aa1ad",
        fontSize: 16,
        cursor: "pointer",
        borderRadius: 7,
      }}
    >
      ✕
    </button>
  );
}
