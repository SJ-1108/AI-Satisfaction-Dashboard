import DashboardClient from "@/components/dashboard/dashboard-client";
import { loadSatisfaction } from "@/lib/data/source";

/** 메뉴 ① 대시보드 (FR-2). 누적 satisfaction 데이터(DB 또는 더미) 기준. */
export default async function DashboardPage() {
  const records = await loadSatisfaction();
  return <DashboardClient records={records} />;
}
