import RecordsClient from "@/components/records/records-client";
import {
  isDummyMode,
  loadRecentBatches,
  loadResetLogs,
  loadSatisfactionCount,
} from "@/lib/data/source";
import { queryRecordsPage } from "./actions";

/** 목록 초기 상태 — RecordsClient 의 필터/정렬/페이징 기본값과 일치해야 한다. */
const INITIAL_QUERY = {
  search: "",
  rating: "all",
  reason: "all",
  sortKey: "created_at",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
} as const;

/**
 * 메뉴 ② 메타베이스 데이터 조회 (FR-3).
 * 목록은 서버에서 필터·정렬·페이징을 끝낸 첫 페이지만 내려보낸다
 * (전체 행을 브라우저로 나르지 않는다).
 */
export default async function RecordsPage() {
  // dbCount 는 DB 실제 총 건수(진단용). 서버가 읽어온 인덱스 건수와 다르면
  // 화면에 경고를 띄워 "조회가 잘렸는데 아무도 모르는" 상황을 막는다.
  const [initialPage, batches, resetLogs, dbCount] = await Promise.all([
    queryRecordsPage(INITIAL_QUERY),
    loadRecentBatches(5),
    loadResetLogs(),
    loadSatisfactionCount(),
  ]);
  return (
    <RecordsClient
      initialPage={initialPage}
      initialBatches={batches}
      initialResetLogs={resetLogs}
      dbCount={dbCount}
      dbMode={!isDummyMode()}
    />
  );
}
