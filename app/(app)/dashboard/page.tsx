import DashboardClient from "@/components/dashboard/dashboard-client";
import { loadFeedback, loadSatisfactionStats } from "@/lib/data/source";

/**
 * 메뉴 ① 대시보드 (FR-2). 누적 satisfaction + feedback 데이터(DB 또는 더미) 기준.
 * 집계에 필요한 컬럼만(loadSatisfactionStats) 조회한다 — summary_text 를 싣지 않아
 * 누적 데이터가 늘어도 전송량이 늘지 않는다.
 */
export default async function DashboardPage() {
  const [records, feedback] = await Promise.all([
    loadSatisfactionStats(),
    loadFeedback(),
  ]);
  return <DashboardClient records={records} feedback={feedback} />;
}
