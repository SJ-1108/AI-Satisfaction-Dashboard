import * as XLSX from "xlsx";

/**
 * 현재 필터 결과를 CSV/XLSX 로 내보낸다 (FR-3.3).
 * 브라우저에서 호출 — SheetJS 가 다운로드를 트리거한다.
 */
export type ExportFormat = "csv" | "xlsx";

/**
 * @param rows   표시 순서대로 정렬된 행 객체 배열(헤더 라벨을 키로 사용)
 * @param filename 확장자 제외 파일명
 */
export function exportRows(
  rows: Record<string, unknown>[],
  filename: string,
  format: ExportFormat,
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "satisfaction");
  XLSX.writeFile(wb, `${filename}.${format}`, {
    bookType: format,
  });
}
