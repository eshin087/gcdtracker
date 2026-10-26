import type { Metadata } from "next";
import { DEMO_READING, DEMO_SOCIAL } from "@/lib/demo-social";
import { InternetOverview } from "@/components/InternetOverview";
import { DEMO_FLOW, DEMO_RECORDS, DEMO_REPORTS } from "@/lib/demo-flow";

export const metadata: Metadata = {
  title:"Internet activity demo",description:"Illustrative public-internet reports with synthetic data.",
  robots:{index:false,follow:false},
};
export default function DashboardDemo() {
  return <InternetOverview demo flow={DEMO_FLOW} records={DEMO_RECORDS} reports={DEMO_REPORTS} reading={DEMO_READING} social={DEMO_SOCIAL}/>;
}
