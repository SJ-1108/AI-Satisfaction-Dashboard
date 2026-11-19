import type { AutoTier } from "@/lib/types";

/**
 * 자동 판정 표시(단계·확신도·확인 필요)를 feedback.detail_reason 에 문자열로 보관한다.
 *
 * detail_reason 은 화면에서 입력·표시하지 않는 보존용 컬럼이라(모달은 기존 값을 그대로
 * 되돌려 저장) DB 스키마 변경 없이 자동 판정 메타를 담을 수 있다. 사람이 쓴 피드백은
 * 이 표식이 없으므로 null 로 해석된다.
 *
 * 형식: `[자동판정] 단계=2단; 확신도=0.55; 확인필요=1; 담당자확인=0`
 *
 * - 확인필요: 2단 건이 담당자 확인 전이면 1 (목록의 '확인 필요' 배지)
 * - 담당자확인: 담당자가 모달에서 한 번이라도 저장했으면 1. 단계와 무관하게 이 값이 1이 되면
 *   담당자명 칸에 'AI 분류' 대신 저장한 사람 이름을 보여 준다. (1단 건도 수정하면 이름으로 바뀌어야
 *   한다는 2026-11-19 담당자 의견 반영)
 */
export interface AutoMark {
  tier: AutoTier;
  confidence: number | null;
  needsReview: boolean;
  /** 담당자가 확인·저장한 건이면 true */
  reviewed: boolean;
}

const PREFIX = "[자동판정]";

export function encodeAutoMark(m: AutoMark): string {
  const parts = [`단계=${m.tier}`];
  if (m.confidence != null) parts.push(`확신도=${m.confidence}`);
  parts.push(`확인필요=${m.needsReview ? 1 : 0}`);
  parts.push(`담당자확인=${m.reviewed ? 1 : 0}`);
  return `${PREFIX} ${parts.join("; ")}`;
}

/**
 * 표식 해석. `times` 는 '담당자확인' 키가 없는 과거 표식(2026-11-19 이전 저장분)을 위한 보조 정보:
 * 업로드 적재는 created_at = updated_at 으로 들어오고, 담당자 저장만 updated_at 을 갱신하므로
 * 두 시각이 1분 넘게 벌어져 있으면 담당자가 저장한 건으로 본다.
 */
export function decodeAutoMark(
  raw: string | null | undefined,
  times?: { created_at?: string | null; updated_at?: string | null },
): AutoMark | null {
  if (!raw || !raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  const get = (key: string): string | null => {
    const m = body.match(new RegExp(`${key}=([^;]*)`));
    return m ? m[1].trim() : null;
  };
  const tier = get("단계");
  if (tier !== "1단" && tier !== "2단") return null;
  const confRaw = get("확신도");
  const conf = confRaw == null ? NaN : Number(confRaw);
  const needsReview = get("확인필요") === "1";
  const reviewedRaw = get("담당자확인");
  let reviewed: boolean;
  if (reviewedRaw != null) {
    reviewed = reviewedRaw === "1";
  } else if (tier === "2단") {
    // 과거 표식: 2단은 업로드 시 확인필요=1 로 들어오므로 0 이면 담당자가 저장한 것
    reviewed = !needsReview;
  } else {
    // 과거 표식의 1단: 담당자 저장 여부가 표식에 없어 수정 시각으로 추정
    const c = Date.parse(times?.created_at ?? "");
    const u = Date.parse(times?.updated_at ?? "");
    reviewed = Number.isFinite(c) && Number.isFinite(u) && u - c > 60_000;
  }
  return {
    tier,
    confidence: Number.isFinite(conf) ? conf : null,
    needsReview,
    reviewed,
  };
}

/**
 * 담당자가 저장했을 때: 자동 판정 표식이면 확인필요=0, 담당자확인=1 로 바꾸고, 아니면 그대로 둔다.
 * (사람이 쓴 피드백은 표식이 없으므로 변화 없음)
 */
export function markReviewed(raw: string | null | undefined): string | null {
  const m = decodeAutoMark(raw);
  if (!m) return raw ?? null;
  return encodeAutoMark({ ...m, needsReview: false, reviewed: true });
}
