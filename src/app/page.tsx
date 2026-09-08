import { InternetOverview } from "@/components/InternetOverview";
import { getHomeReports } from "@/lib/home-reports";
import { getFlowData, getLatestRecords } from "@/lib/stats-sources";

export const revalidate = 300;

export default async function HomePage() {
  const [flow, records, reports] = await Promise.all([getFlowData(30), getLatestRecords(12), getHomeReports()]);
  return <InternetOverview flow={flow} records={records} reports={reports}/>;
}
