import type { Metadata } from "next";
import Link from "next/link";
import { AgentFlow } from "@/components/AgentFlow";
import { DEMO_FLOW, DEMO_RECORDS } from "@/lib/demo-flow";
export const metadata:Metadata={title:"Agents → destinations demo",description:"Illustrative dashboard demo with synthetic activity and source metadata.",robots:{index:false,follow:false}};
export default function DashboardDemo(){
  return <div className="shell explorer dashboard-demo">
    <p className="label">Interactive preview · sample data</p>
    <h1>Agents → destinations</h1>
    <p className="demo-notice"><strong>These numbers and records are synthetic.</strong> This demo illustrates the dashboard, attribution labels and collection states. It does not measure real activity or connect to the production database.</p>
    <p className="sans dim">Follow the animated paths, choose a destination, then inspect a source for its purpose, evidence, coverage and freshness. Pause the animation at any time.</p>
    <AgentFlow data={DEMO_FLOW} records={DEMO_RECORDS}/>
    <p className="sans"><Link href="/#flow">Open the observed dashboard →</Link> · <Link href="/methods">Read the measurement methods</Link></p>
  </div>;
}
