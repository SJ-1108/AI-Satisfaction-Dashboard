import { useCallback, useEffect, useRef } from "react";

/**
 * 차트가 있는 페이지의 PDF 내보내기(인쇄) 공용 훅.
 *
 * 인쇄 시엔 CSS zoom/transform 으로 축소하지 않는다(텍스트가 래스터화되어 자글거리고
 * Chart.js 도넛 arc 가 깨진다). 대신 @media print(globals.css)에서 레이아웃을 A4
 * 인쇄 가능폭으로 자연스럽게 리플로우시키고, 이 훅이 인쇄 직전 각 차트 캔버스를
 * 정적 이미지로 스냅샷해(`.pdf-chart-box canvas` → `<img data-pdf-snap>`, 캔버스는 숨김)
 * 폭에 맞춰 깨끗하게 축소되도록 한다. 인쇄 후 원복.
 *
 * 사용: 차트 컨테이너에 `className="pdf-chart-box"` 를 주고, 컴포넌트에서
 *   const { exportPdf } = useChartPdfExport();
 * 를 호출한 뒤 버튼 onClick 에 exportPdf 를 연결한다. 브라우저 인쇄(Ctrl+P)는
 * beforeprint 리스너가 자동으로 커버한다.
 */

/**
 * `.pdf-chart-box` 안의 각 캔버스를 정적 `<img>`로 스냅샷해 얹고 캔버스는 숨긴다.
 * 스냅샷은 화면(리플로우 전) 상태에서 떠야 도넛이 살아있는 비트맵을 캡처한다.
 * 반환된 restore()로 인쇄 후 원복.
 */
function snapshotChartsToImages(): {
  imgs: HTMLImageElement[];
  restore: () => void;
} {
  const canvases = Array.from(
    document.querySelectorAll<HTMLCanvasElement>(".pdf-chart-box canvas"),
  );
  const imgs: HTMLImageElement[] = [];
  const hidden: HTMLCanvasElement[] = [];
  for (const c of canvases) {
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) continue;
    let url: string;
    try {
      url = c.toDataURL("image/png");
    } catch {
      continue; // 오염된 캔버스(예상 밖)면 건너뜀
    }
    const img = document.createElement("img");
    img.src = url;
    // 컨테이너 폭에 맞춰 스케일(인쇄 시 A4 폭으로 리플로우되면 비율대로 축소).
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.dataset.pdfSnap = "1";
    c.parentElement?.insertBefore(img, c);
    c.style.display = "none";
    imgs.push(img);
    hidden.push(c);
  }
  const restore = () => {
    imgs.forEach((img) => img.remove());
    hidden.forEach((c) => {
      c.style.display = "";
    });
  };
  return { imgs, restore };
}

/** 스냅샷 이미지들이 디코드 완료될 때까지 대기 (인쇄 캡처 전 보장). */
function decodeImages(imgs: HTMLImageElement[]): Promise<unknown> {
  return Promise.all(
    imgs.map((img) =>
      img.decode ? img.decode().catch(() => undefined) : Promise.resolve(),
    ),
  );
}

export function useChartPdfExport(): { exportPdf: () => Promise<void> } {
  // 인쇄 중 활성화된 스냅샷 원복 함수 (버튼/Ctrl+P 경로 공용).
  const snapRestoreRef = useRef<null | (() => void)>(null);

  // 브라우저 인쇄(Ctrl+P)도 커버 — 인쇄 직전 차트 스냅샷, 인쇄 후 원복.
  useEffect(() => {
    const before = () => {
      if (snapRestoreRef.current) return; // 버튼 경로에서 이미 처리됨
      snapRestoreRef.current = snapshotChartsToImages().restore;
    };
    const after = () => {
      snapRestoreRef.current?.();
      snapRestoreRef.current = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // "PDF 내보내기" 버튼 — 차트 스냅샷(이미지 디코드 대기) → 인쇄 → 원복.
  // (버튼 경로는 화면 상태에서 스냅샷을 미리 떠 이미지 로드를 보장하므로 가장 안정적)
  const exportPdf = useCallback(async () => {
    const { imgs, restore } = snapshotChartsToImages();
    snapRestoreRef.current = restore; // beforeprint 재스냅샷 방지
    try {
      await decodeImages(imgs);
      window.print();
    } finally {
      restore();
      snapRestoreRef.current = null;
    }
  }, []);

  return { exportPdf };
}
