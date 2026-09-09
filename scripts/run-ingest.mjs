import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const SOURCES = new Set(["all","ipranges","wikipedia","wikimedia","moltbook","osm","mcp","botcommits","agentwatch","radar","packages","baseline","github","watched","github-signatures","retention"]);
const escape = value => String(value).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
const cell = value => String(value).replace(/[|`<>\r\n]/g," ");
export function summarizeIngest(status,body) {
  if (!Array.isArray(body?.reports) || !body.reports.length) throw new Error(`Ingest HTTP ${status}: missing collector reports`);
  let failed = status !== 200;
  const lines=["| Source | Outcome | Detail |","|---|---|---|"];
  const annotations=[];
  for (const report of body.reports) {
    if (!report || typeof report.source!=="string" || !["success","partial","failed","disabled"].includes(report.outcome)) throw new Error("Invalid collector report");
    const detail=report.error ?? JSON.stringify(report.stats ?? {});
    lines.push(`| ${cell(report.source)} | ${report.outcome} | ${cell(detail)} |`);
    if (report.outcome === "failed") failed=true;
    if (report.outcome === "failed" || report.outcome === "partial") annotations.push(`::${report.outcome === "failed" ? "error" : "warning"} title=${escape("Collector: "+report.source)}::${escape(detail)}`);
  }
  if (status!==200 && !body.reports.some(r=>r.outcome==="failed")) annotations.push(`::error::Unexpected ingest HTTP ${status}`);
  return {failed,summary:lines.join("\n")+"\n",annotations};
}
export async function main(env=process.env) {
  const source=env.SOURCE ?? "all";
  if (!SOURCES.has(source)) throw new Error("Unknown source");
  if (!env.SITE_URL || !env.CRON_SECRET) throw new Error("SITE_URL or CRON_SECRET missing");
  const site=new URL(env.SITE_URL);
  if (site.protocol!=="https:" || site.username || site.password) throw new Error("SITE_URL must be HTTPS without credentials");
  const response=await fetch(new URL("/api/ingest/"+source,site),{
    method:"POST",headers:{authorization:"Bearer "+env.CRON_SECRET,"user-agent":"gcdTracker-actions/0.4"},
    signal:AbortSignal.timeout(290_000),
  });
  const body=await response.json().catch(()=>null);
  const report=summarizeIngest(response.status,body);
  console.log(`HTTP ${response.status}\n${report.summary}`);
  for(const annotation of report.annotations) console.log(annotation);
  if(env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,report.summary);
  if(report.failed) process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{
  console.error("::error::"+escape(error instanceof Error ? error.message : error));process.exitCode=1;
});
