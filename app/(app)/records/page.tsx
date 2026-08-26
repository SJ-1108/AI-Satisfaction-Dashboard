import RecordsClient from "@/components/records/records-client";
import {
  isDummyMode,
  loadRecentBatches,
  loadResetLogs,
  loadSatisfaction,
  loadSatisfactionCount,
} from "@/lib/data/source";

/** 메뉴 ② 메타베이스 데이터 조회 (FR-3). 누적 satisfaction 데이터(DB 또는 더미). */
export default async function RecordsPage() {
  // dbCount 는 DB 실제 총 건수(진단용). 로드된 건수와 다르면 화면에 경고를 띄워
  // "조회가 잘렸는데 아무도 모르는" 상황을 막는다.
  const [records, batches, resetLogs, dbCount] = await Promise.all([
    loadSatisfaction(),
    loadRecentBatches(5),
    loadResetLogs(),
    loadSatisfactionCount(),
  ]);
  return (
    <RecordsClient
      initialRecords={records}
      initialBatches={batches}
      initialResetLogs={resetLogs}
      dbCount={dbCount}
      dbMode={!isDummyMode()}
    />
  );
}
