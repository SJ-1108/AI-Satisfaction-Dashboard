import RecordsClient from "@/components/records/records-client";
import { isDummyMode, loadRecentBatches, loadSatisfaction } from "@/lib/data/source";

/** 메뉴 ② 메타베이스 데이터 조회 (FR-3). 누적 satisfaction 데이터(DB 또는 더미). */
export default async function RecordsPage() {
  const [records, batches] = await Promise.all([
    loadSatisfaction(),
    loadRecentBatches(5),
  ]);
  return (
    <RecordsClient
      initialRecords={records}
      initialBatches={batches}
      dbMode={!isDummyMode()}
    />
  );
}
