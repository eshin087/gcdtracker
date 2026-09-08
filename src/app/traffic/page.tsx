import type { Metadata } from "next";
import { MiniChart, TimelineChart } from "@/components/charts";
import { BarList, Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtDate, fmtInt, fmtStamp } from "@/lib/format";
import { hasDatabase } from "@/lib/stats";
import { getRadarSnapshot } from "@/lib/stats-sources";
import type { RadarMetadata } from "@/lib/ingest/radar";
import { isRadarStale, radarUnit, radarValue } from "@/components/radar-labels";
import { getRobotsCensus, ROBOTS_OPERATORS } from "@/lib/stats-census";
import { ROBOTS_CENSUS } from "@/lib/ingest/robots-census";
import industry from "../../../data/industry.json";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Traffic",
  description: "AI crawler traffic observed by Cloudflare Radar and crawler policies sampled from Common Crawl.",
};

export default async function TrafficPage() {
  const db = hasDatabase();
  const [radarSnapshot, census] = await Promise.all([getRadarSnapshot(), getRobotsCensus()]);
  const { series: radar, metadata: radarMeta } = radarSnapshot;
  const latestCrawl = census.at(-1) ?? null;
  const blockedShare = (token: string) => census.map((c) => (c.sites > 0 ? (100 * (c.tokens[token]?.blocked ?? 0)) / c.sites : 0));
  const latestRanked = latestCrawl
    ? Object.entries(latestCrawl.tokens)
        .filter(([t]) => t !== "*" && t !== "Googlebot" && t !== "Bingbot")
        .map(([t, v]) => ({ token: t, blocked: (100 * v.blocked) / latestCrawl.sites, mentioned: (100 * v.mentioned) / latestCrawl.sites }))
        .sort((a, b) => b.blocked - a.blocked)
    : [];
  const botShare = Object.entries(radar)
    .filter(([k]) => k.startsWith("bot-share:") && radarMeta["bot-share"])
    .map(([k, pts]) => ({ bot: k.replace("bot-share:", ""), value: pts[pts.length - 1]?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const crawlRefer = Object.entries(radar)
    .filter(([k]) => k.startsWith("crawl-refer:") && radarMeta["crawl-refer"])
    .map(([k, pts]) => ({ platform: k.replace("crawl-refer:", ""), value: pts[pts.length - 1]?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const operators = Object.entries(radar).filter(([k]) => k.startsWith("operator:") && radarMeta.operator);
  const hasRadar = botShare.length > 0 || crawlRefer.length > 0 || operators.length > 0;
  const radarDates = Object.values(radarMeta).map((m) => m.fetchedAt).sort();
  const latestRadar = radarDates.at(-1);
  const radarStale = isRadarStale(latestRadar);

  return (
    <div className="shell explorer">
      <PageHeader
        title="Traffic"
        sub="AI systems read the web as well as write to it. This page follows the requests: published measurements from network operators and crawler policies in sampled hosts."
      />
      <StatTiles
        tiles={[
          { value: "4.2%", label: "of HTML requests from AI bots other than Googlebot", sub: "Cloudflare Radar, Dec 2025" },
          { value: "15×", label: "growth in user-triggered AI fetches in 2025", sub: "Cloudflare Radar, Dec 2025" },
          { value: hasRadar ? radarStale ? "stale snapshot" : "source snapshot" : "historical quotes", label: "Cloudflare Radar data", sub: latestRadar ? "Fetched " + fmtStamp(latestRadar) : "No snapshot with verified units is available" },
        ]}
      />

      <div className="section-head">
        <h2>Internet-scale, from Cloudflare Radar</h2>
        <a className="more" href="https://radar.cloudflare.com/ai-insights">
          radar.cloudflare.com/ai-insights ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Cloudflare fronts a large share of the web and publishes bot statistics under CC BY 4.0 (dashboard) and CC BY-NC 4.0
        (API). Training crawlers collect content for model development; search and retrieval bots index pages or fetch them in
        response to a user; referred readers are people following links from AI platforms. The figures describe Cloudflare&apos;s
        vantage point, not internet-wide totals.
      </p>
      {hasRadar ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 28 }}>
          {botShare.length > 0 ? (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Bot traffic by bot · {radarUnit(radarMeta["bot-share"])}
              </div>
              <RadarContext meta={radarMeta["bot-share"]} />
              <BarList rows={botShare.slice(0, 12).map((b) => ({ key: b.bot, label: b.bot, value: b.value }))} format={(v) => radarValue(v, radarMeta["bot-share"])} />
            </div>
          ) : null}
          {crawlRefer.length > 0 ? (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Crawl/referral metric · {radarUnit(radarMeta["crawl-refer"])}
              </div>
              <RadarContext meta={radarMeta["crawl-refer"]} />
              <BarList rows={crawlRefer.map((c) => ({ key: c.platform, label: c.platform, value: c.value }))} format={(v) => radarValue(v, radarMeta["crawl-refer"])} variant="neutral" />
            </div>
          ) : null}
          {operators.length ? <RadarContext meta={radarMeta.operator} /> : null}
          {operators.slice(0, 4).map(([k, pts]) => (
            <MiniChart summarize={false} format={(v) => radarValue(v, radarMeta.operator)} key={k} days={pts.map((p) => p.period)} values={pts.map((p) => p.value)} label={`${k.replace("operator:", "")} · ${radarUnit(radarMeta.operator)}`} />
          ))}
        </div>
      ) : (
        <div className="embed-card">
          <h3>No comparable Radar snapshot is available yet.</h3>
          <p>
            See the publisher&apos;s current dashboards:{" "}
            <a href="https://radar.cloudflare.com/ai-insights">AI Insights</a> (bot traffic by bot and purpose, crawl-to-refer ratios) and{" "}
            <a href="https://radar.cloudflare.com/bots">Bots</a>. Published figures we cite:
          </p>
          <ul className="sans" style={{ fontSize: 13, color: "var(--ink-2)", margin: "6px 0 0 18px", lineHeight: 1.5 }}>
            {industry.facts
              .filter((f) => f.verified)
              .map((f) => (
                <li key={f.text.slice(0, 30)}>
                  {f.text} <a href={f.url}>{f.source}</a>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="section-head">
        <h2>Crawler rules in sampled robots.txt files</h2>
        <a className="more" href={ROBOTS_CENSUS.site}>
          Common Crawl robots.txt archive ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Every Common Crawl crawl (roughly monthly) archives the robots.txt of each site it visits. A worker samples {latestCrawl ? fmtInt(latestCrawl.files) : "100"} of
        those archive files per crawl, spread across the crawl, and counts sites whose robots.txt names an AI crawler and sites that block it completely
        (<code className="mono">Disallow: /</code> for that agent). Shares are of all sampled sites with a readable robots.txt, so they describe this Common Crawl sample. They cannot establish a whole-web rate, and sites that exclude Common Crawl are underrepresented.
      </p>
      {census.length === 0 ? (
        <Empty db={db}>No corrected v2 sample is available yet. Legacy records remain stored separately; no automatic historical repair is run.</Empty>
      ) : (
        <>
          <TimelineChart sharedScale
            days={census.map((c) => c.date)}
            bars={blockedShare("GPTBot")}
            barLabel="Sites blocking GPTBot (%)"
            line={blockedShare("ClaudeBot")}
            lineLabel="Sites blocking ClaudeBot (%)"
            title="Share of sampled sites that fully block, per crawl"
            height={220}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 28, marginTop: 20 }}>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Blocked completely · crawl of {latestCrawl ? fmtDate(latestCrawl.date) : ""} · {latestCrawl ? fmtInt(latestCrawl.sites) : ""} sites sampled
              </div>
              <BarList
                rows={latestRanked.slice(0, 14).map((r) => ({ key: r.token, label: r.token, value: r.blocked, secondary: r.mentioned, title: `${ROBOTS_OPERATORS[r.token] ?? ""} · named by ${r.mentioned.toFixed(2)}%` }))}
                format={(v) => `${v.toFixed(2)}%`}
              />
              <p className="dim sans" style={{ fontSize: 12.5, marginTop: 8 }}>
                Accent: fully blocked. Grey: named at all. Googlebot is blocked by {latestCrawl ? ((100 * (latestCrawl.tokens.Googlebot?.blocked ?? 0)) / latestCrawl.sites).toFixed(2) : "–"}% of the same sites, for scale.
              </p>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Per crawl
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Crawl</th>
                      <th className="num">Sites</th>
                      <th className="num">GPTBot</th>
                      <th className="num">ClaudeBot</th>
                      <th className="num">CCBot</th>
                      <th className="num">Google-Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...census].reverse().slice(0, 14).map((c) => (
                      <tr key={c.date}>
                        <td className="mono">{fmtDate(c.date)}</td>
                        <td className="num dim">{fmtInt(c.sites)}</td>
                        {["GPTBot", "ClaudeBot", "CCBot", "Google-Extended"].map((t) => (
                          <td className="num" key={t}>
                            {((100 * (c.tokens[t]?.blocked ?? 0)) / c.sites).toFixed(2)}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Crawler share, 2024 → 2025</h2>
        <a className="more" href={industry.crawlerShareSource.url}>
          source ↗
        </a>
      </div>
      <table className="tbl" style={{ maxWidth: 560 }}>
        <thead>
          <tr>
            <th>Crawler</th>
            <th className="num">May 2024</th>
            <th className="num">May 2025</th>
          </tr>
        </thead>
        <tbody>
          {industry.crawlerShare.map((c) => (
            <tr key={c.label}>
              <td>{c.label}</td>
              <td className="num">{c.may2024}%</td>
              <td className="num">{c.may2025}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim sans" style={{ fontSize: 12.5, marginTop: 10 }}>
        Historical share of crawler traffic observed by Cloudflare in the labelled publication periods.
      </p>
    </div>
  );
}

function RadarContext({ meta }: { meta: RadarMetadata | undefined }) {
  if (!meta) return null;
  const window = meta.dateRange.map((r) => fmtStamp(r.startTime) + " – " + fmtStamp(r.endTime)).join("; ");
  return <p className="dim sans" style={{ fontSize: 12 }}>Window: {window}. {radarUnit(meta)}. {meta.lastUpdated ? "Source updated " + fmtStamp(meta.lastUpdated) + ". " : ""}Fetched {fmtStamp(meta.fetchedAt)}. {meta.normalization.toUpperCase() === "RAW_VALUES" ? "Values retain the source units for this window." : "Normalized series describe this snapshot and are not raw request counts."}</p>;
}
