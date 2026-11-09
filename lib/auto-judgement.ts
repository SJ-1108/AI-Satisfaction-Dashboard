import type { AutoTier } from "@/lib/types";

/**
 * 자동 판정 표시(단계·확신도·확인 필요)를 feedback.detail_reason 에 문자열로 보관한다.
 *
 * detail_reason 은 화면에서 입력·표시하지 않는 보존용 컬럼이라(모달은 기존 값을 그대로
 * 되돌려 저장) DB 스키마 변경 없이 자동 판정 메타를 담을 수 있다. 사람이 쓴 피드백은
 * 이 표식이 없으므로 null 로 해석된다.
 *
 * 형식: `[자동판정] 단계=2단; 확신도=0.55; 확인필요=1`
 */
export interface AutoMark {
  tier: AutoTier;
  confidence: number | null;
  needsReview: boolean;
}

const PREFIX = "[자동판정]";

export function encodeAutoMark(m: AutoMark): string {
  const parts = [`단계=${m.tier}`];
  if (m.confidence != null) parts.push(`확신도=${m.confidence}`);
  parts.push(`확인필요=${m.needsReview ? 1 : 0}`);
  return `${PREFIX} ${parts.join("; ")}`;
}

export function decodeAutoMark(raw: string | null | undefined): AutoMark | null {
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
  return {
    tier,
    confidence: Number.isFinite(conf) ? conf : null,
    needsReview: get("확인필요") === "1",
  };
}

/** 담당자가 저장했을 때: 자동 판정 표식이면 확인필요=0 으로 바꾸고, 아니면 그대로 둔다. */
export function markReviewed(raw: string | null | undefined): string | null {
  const m = decodeAutoMark(raw);
  if (!m) return raw ?? null;
  return encodeAutoMark({ ...m, needsReview: false });
}
