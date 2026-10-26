import { InternetOverview } from "@/components/InternetOverview";
import { getHomeReports } from "@/lib/home-reports";
import { getSocialReport } from "@/lib/stats-social";
import { getFlowData, getLatestRecords, getRadarSnapshot } from "@/lib/stats-sources";

export const revalidate = 300;

export default async function HomePage() {
  const [flow, records, reports, reading, social] = await Promise.all([getFlowData(30), getLatestRecords(12), getHomeReports(), getRadarSnapshot(), getSocialReport()]);
  return <InternetOverview flow={flow} records={records} reports={reports} reading={reading} social={social}/>;
}
