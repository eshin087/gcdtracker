import Link from "next/link";
import { MultiLine } from "./census-charts";
import { FigureHead } from "./ui";
import { isRadarStale, radarUnit, radarValue } from "./radar-labels";
import { fmtStamp } from "@/lib/format";
import { readingLines, type ReadingSnapshot } from "@/lib/reading-report";
export type { ReadingSnapshot } from "@/lib/reading-report";

export function ReadingReport({ data, demo = false }: { data: ReadingSnapshot; demo?: boolean }) {
  const meta = data.metadata["crawl-purpose"];
  const series = readingLines(data);
  return <section id="ai-reading" className="overview-report" aria-labelledby="reading-heading">
    <FigureHead id="reading-heading" title="AI reading · crawler purpose"
      sub="Share of observed AI crawler traffic by training, search and user-triggered retrieval purpose."
      more={{ href: "/traffic", label: "Traffic evidence →" }} />
    {meta && series.length ? <>
      <p className="report-source">{demo ? "Synthetic preview. " : isRadarStale(meta.fetchedAt) ? "Stale snapshot. " : ""}
        {radarUnit(meta)} · {meta.dateRange.map(r => fmtStamp(r.startTime) + " – " + fmtStamp(r.endTime)).join("; ")}.
        Fetched {fmtStamp(meta.fetchedAt)}{meta.lastUpdated ? "; source updated " + fmtStamp(meta.lastUpdated) : ""}.
      </p>
      <MultiLine series={series} title="Share of Cloudflare-observed AI crawler traffic by purpose" height={230} labelWidth={156}
        showPoints={false} shortAxis format={v => radarValue(v, meta)} />
      <p className="report-source">{meta.coverage ? meta.coverage.observedDays + "/" + meta.coverage.expectedDays + " days with all purpose categories observed; " + meta.coverage.missingDays.length + " missing or incomplete days. " : ""}One source window and normalization basis. Gaps stay visible. Percentages describe purpose mix, not growth in raw requests.</p>
    </> : <p className="empty">No crawl-purpose snapshot is available yet. Missing observations do not mean zero crawler traffic.</p>}
    <p className="report-source"><a href="https://radar.cloudflare.com/ai-insights">Cloudflare Radar</a> measures traffic visible to its network.
      It does not expose who reads a particular social post. <Link href="/social">Publishing signals</Link> are measured separately.</p>
  </section>;
}
