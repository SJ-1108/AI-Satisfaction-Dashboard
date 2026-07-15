"use client";

import { useState } from "react";
import { reasonLabel } from "@/lib/reasons";
import { formatKstDateTime } from "@/lib/format-date";
import type { FeedbackRow, FeedbackEdit } from "@/lib/data/feedback-view";
import ReadField from "@/components/ui/read-field";
import CloseButton from "@/components/ui/close-button";
import Combobox from "@/components/ui/combobox";
import { DEPARTMENTS, parseDepartments } from "@/lib/departments";
import { CAUSE_CATEGORIES } from "@/lib/cause-categories";
import {
  FEEDBACK_STATUSES,
  statusLabel,
  STATUS_COLOR,
  statusTint,
  statusInk,
  type FeedbackStatus,
} from "@/lib/types";

/**
 * 피드백 편집 모달 (FR-4.2 / FR-4.3) — 단순화 버전.
 * 원본(질의어·AI 답변·평가 사유·의견)은 읽기 전용, 원인 분류(칩) + 피드백 내용(조치)만 입력.
 * 진행 상태는 모달·목록 인라인 양쪽에서 변경 가능(저장 후 목록과 연동). 상세사유·메모 등 기존 값은 보존하여 저장.
 */
export default function FeedbackDialog({
  row,
  currentUserName,
  saving,
  onSave,
  onClose,
}: {
  row: FeedbackRow;
  currentUserName: string;
  saving: boolean;
  onSave: (edit: FeedbackEdit) => void;
  onClose: () => void;
}) {
  const [cause, setCause] = useState<string | null>(row.cause_category ?? null);
  // 유관 부서: 쉼표 구분 문자열 ↔ 칩 배열 (기존 단일/쉼표 값 모두 호환)
  const [depts, setDepts] = useState<string[]>(() =>
    parseDepartments(row.related_department),
  );
  const [content, setContent] = useState(row.action ?? "");
  // 처리 상태: 모달에서 변경 → 저장 시 목록과 연동(persist 후 router.refresh)
  const [status, setStatus] = useState<FeedbackStatus>(row.status);

  // 콤보박스에는 아직 선택되지 않은 부서만 노출(중복 추가 방지).
  const deptOptions = DEPARTMENTS.filter((d) => !depts.includes(d));

  function addDept(d: string) {
    if (d && !depts.includes(d)) setDepts((prev) => [...prev, d]);
  }
  function removeDept(d: string) {
    setDepts((prev) => prev.filter((x) => x !== d));
  }

  // 기존 값이 프리셋에 없으면 칩으로 추가해 선택 상태를 유지
  const causeChips = Array.from(
    new Set([...CAUSE_CATEGORIES, ...(row.cause_category ? [row.cause_category] : [])]),
  );

  const author = row.hasFeedback ? row.updated_by ?? currentUserName : currentUserName;
  const savedAt = row.updated_at ? formatKstDateTime(row.updated_at) : null;

  function submit() {
    onSave({
      satisfaction_id: row.satisfaction_id,
      status, // 모달에서 선택한 처리 상태 (목록과 연동)
      detail_reason: row.detail_reason, // 기존 값 보존
      cause_category: cause,
      // 선택된 부서 목록을 쉼표 구분 문자열로 저장(미선택 시 null)
      related_department: depts.length ? depts.join(", ") : null,
      action: content.trim() || null,
      memo: row.memo, // 기존 값 보존
    });
  }

  return (
    // 배경 클릭으로는 닫지 않는다 (X·취소·저장 버튼으로만 닫힘)
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(16,24,40,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 820,
          height: 900,
          maxHeight: "90vh",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(16,24,40,.3)",
          padding: 28,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
              피드백 입력
            </h2>
            <div style={{ fontSize: 12, color: "#9aa1ad" }}>No. {row.record_no}</div>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {/* 본문 (스크롤) — 입력 중 레이아웃 흔들림 방지:
            scrollbarGutter:stable(스크롤바 토글 시 가로폭 고정),
            overflowAnchor:none(리플로우 시 스크롤 위치 튐 방지) */}
        <div
          style={{
            flex: 1,
            overflowY: "scroll",
            scrollbarGutter: "stable",
            overflowAnchor: "none",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* 읽기 전용 원본 */}
          <ReadField label="질의어">{row.query ?? "-"}</ReadField>
          <ReadField label="AI 답변">{row.summary_text ?? "-"}</ReadField>
          <ReadField label="평가 사유">
            {row.reason ? reasonLabel(row.reason) : "-"}
          </ReadField>
          <ReadField label="의견">{row.comment ?? "-"}</ReadField>

          {/* 업로드 엑셀 추가 컬럼(읽기 전용) — 기존 원본 필드와 동일한 회색 박스 디자인.
              데이터 key(device_type/guardrail_label)가 아직 없으면 "-" 표시 */}
          <ReadField label="기기 종류">{row.device_type ?? "-"}</ReadField>
          <ReadField label="가드레일">{row.guardrail_label ?? "-"}</ReadField>

          {/* 원인 분류 (칩) */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              원인 분류
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {causeChips.map((label) => {
                const sel = cause === label;
                return (
                  <div
                    key={label}
                    onClick={() => setCause(sel ? null : label)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "9px 16px",
                      border: `1px solid ${sel ? "#2f6bff" : "#e2e5ea"}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      color: sel ? "#fff" : "#3a4150",
                      background: sel ? "#2f6bff" : "#fff",
                      userSelect: "none",
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 유관 부서 (드롭다운 선택 → 칩 누적, 칩 X로 해제) */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              유관 부서
            </div>
            {/* 드롭다운(고정 너비) + 칩 영역(남은 폭, 우측에서만 줄바꿈) 나란히 배치 */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flexShrink: 0 }}>
                <Combobox
                  value=""
                  options={deptOptions}
                  onChange={addDept}
                  width={260}
                  ariaLabel="유관 부서"
                  placeholder="유관 부서(팀)명 입력"
                />
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 42,
                }}
              >
                {depts.map((d) => (
                  <span
                    key={d}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 8px 0 12px",
                      border: "1px solid #cdd9ff",
                      borderRadius: 999,
                      background: "#eef3ff",
                      color: "#2f6bff",
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* 라인박스가 아닌 글자 높이 기준으로 중앙 정렬되도록 flex 로 감싼다 */}
                    <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 1 }}>
                      {d}
                    </span>
                    <button
                      type="button"
                      aria-label={`${d} 삭제`}
                      onClick={() => removeDept(d)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        padding: 0,
                        border: "none",
                        borderRadius: 999,
                        background: "transparent",
                        color: "#2f6bff",
                        cursor: "pointer",
                      }}
                    >
                      {/* × 글리프 대신 SVG 로 버튼 중앙에 정확히 배치 */}
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path
                          d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 피드백 내용 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              피드백 내용
            </div>
            <textarea
              placeholder="피드백 내용 또는 메모사항을 입력하세요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                height: 140,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                color: "#1a1d23",
                border: "1px solid #e2e5ea",
                borderRadius: 10,
                outline: "none",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 처리 상태 (상태별 지정색 칩 — 모달에서 선택 → 목록의 상태값과 연동) */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3a4150", marginBottom: 8 }}>
              처리 상태
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FEEDBACK_STATUSES.map((s) => {
                const sel = status === s;
                const color = STATUS_COLOR[s];
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setStatus(s)}
                    aria-pressed={sel}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "9px 16px",
                      border: "none",
                      outline: "none",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: sel ? 700 : 600,
                      fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                      lineHeight: 1,
                      // 선택: 진한 색(ink) 채움 + 흰 글자 / 비선택: 연한 틴트 + 진한 글자.
                      // 밝은 상태색(검토중 등)도 진↔연 명도 대비로 확실히 구분된다.
                      color: sel ? "#fff" : statusInk(color),
                      background: sel ? statusInk(color) : statusTint(color),
                    }}
                  >
                    {statusLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 작성자 + 최근 저장일시 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7280" }}>
            <span style={{ fontWeight: 600, color: "#3a4150" }}>작성자</span>
            <span>{author}</span>
            <span style={{ fontSize: 12, color: "#9aa1ad" }}>
              {savedAt ? `· 최근 저장 ${savedAt}` : "· 저장 이력 없음"}
            </span>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 42,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              color: "#5a616e",
              background: "#fff",
              border: "1px solid #e2e5ea",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              height: 42,
              padding: "0 22px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              color: "#fff",
              background: "#2f6bff",
              border: "none",
              borderRadius: 10,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
