import type { Chart, Plugin } from "chart.js";

/**
 * PDF/인쇄 전용 "차트 값 라벨" 플러그인.
 *
 * 값(건수)은 평소 호버 툴팁에만 있어 인쇄/PDF 스냅샷에는 남지 않는다. 이 플러그인은
 * `valueLabelState.show` 가 켜졌을 때만 막대·선차트 요소 위에 값을 직접 그려, PDF
 * 내보내기 스냅샷에 수치가 함께 담기도록 한다. (도넛은 HTML 범례에서 건수를 노출하므로
 * 조각이 겹쳐 지저분해지지 않게 여기서는 제외한다.)
 *
 * 켜고/끄는 동기 재렌더는 use-chart-pdf-export 훅이 담당한다
 * (ChartJS.defaults.animation=false 라 update() 가 동기적으로 다시 그린다).
 */

export const valueLabelState = { show: false };

const LABEL_COLOR = "#3a4150"; // 배경(흰색) 위 본문 톤 — 대비 확보
const LABEL_FONT =
  "600 12px 'Pretendard Variable', Pretendard, -apple-system, sans-serif";

/** raw 데이터 포인트에서 표시할 수치를 뽑는다(숫자/{x}/{y} 대응). */
function numericValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw && typeof raw === "object") {
    const o = raw as { x?: unknown; y?: unknown };
    const v = typeof o.y === "number" ? o.y : typeof o.x === "number" ? o.x : null;
    return v != null && Number.isFinite(v) ? v : null;
  }
  return null;
}

function isStacked(chart: Chart): boolean {
  const scales = chart.options.scales as
    | Record<string, { stacked?: boolean } | undefined>
    | undefined;
  return Boolean(scales?.x?.stacked || scales?.y?.stacked);
}

export const valueLabelsPlugin: Plugin = {
  id: "pdfValueLabels",
  afterDatasetsDraw(chart) {
    if (!valueLabelState.show) return;
    const type = (chart.config as { type?: string }).type;
    if (type !== "bar" && type !== "line") return; // 도넛/파이 제외

    const { ctx } = chart;
    ctx.save();
    ctx.font = LABEL_FONT;
    ctx.fillStyle = LABEL_COLOR;

    const stacked = type === "bar" && isStacked(chart);

    if (stacked) {
      // 누적 막대 — 인덱스별 합계를 스택 최상단 바깥에 한 번만 표기.
      drawStackedTotals(chart, ctx);
    } else {
      drawPerElement(chart, ctx, type);
    }

    ctx.restore();
  },
};

/** 비누적 막대·선차트 — 각 요소 값을 막대 끝/포인트 바깥에 표기. */
function drawPerElement(
  chart: Chart,
  ctx: CanvasRenderingContext2D,
  type: "bar" | "line",
): void {
  chart.data.datasets.forEach((ds, di) => {
    const meta = chart.getDatasetMeta(di);
    if (meta.hidden) return;
    meta.data.forEach((el, i) => {
      const value = numericValue(ds.data[i] as unknown);
      if (value == null || value === 0) return;
      const text = value.toLocaleString();
      const props = el.getProps(["x", "y", "base", "horizontal"], true) as {
        x: number;
        y: number;
        base?: number;
        horizontal?: boolean;
      };
      if (type === "bar" && props.horizontal) {
        // 가로 막대 — 막대 끝 오른쪽.
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, props.x + 5, props.y);
      } else {
        // 세로 막대·선 포인트 — 위쪽.
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(text, props.x, props.y - 5);
      }
    });
  });
}

/** 누적 막대 — 인덱스별 합계를 스택 최상단 위에 표기. */
function drawStackedTotals(chart: Chart, ctx: CanvasRenderingContext2D): void {
  const count = chart.data.labels?.length ?? 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let i = 0; i < count; i++) {
    let total = 0;
    let topY = Infinity;
    let x = 0;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      const value = numericValue(ds.data[i] as unknown);
      if (value == null) return;
      total += value;
      const el = meta.data[i];
      if (!el) return;
      const p = el.getProps(["x", "y"], true) as { x: number; y: number };
      if (p.y < topY) {
        topY = p.y;
        x = p.x;
      }
    });
    if (total <= 0 || !Number.isFinite(topY)) continue;
    ctx.fillText(total.toLocaleString(), x, topY - 5);
  }
}
