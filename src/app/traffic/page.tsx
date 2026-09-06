import type { Metadata } from "next";
import Link from "next/link";
import { MiniChart, TimelineChart } from "@/components/charts";
import { BarList, Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { getCategoryBreakdown, getOverview, getTrafficByDay, hasDatabase } from "@/lib/stats";
import { getSeries } from "@/lib/stats-sources";
import industry from "../../../data/industry.json";
import { CATEGORY_LABELS } from "@/lib/agents/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Traffic",
  description: "How much web traffic comes from AI: this site's own measurement and internet-scale figures from Cloudflare Radar.",
};

export default async function TrafficPage() {
  const db = hasDatabase();
  const [overview, byDay, breakdown, radar] = await Promise.all([getOverview(), getTrafficByDay(60), getCategoryBreakdown(30), getSeries("radar")]);
  const days = byDay.map((d) => d.day);
  const totalBreakdown = breakdown.reduce((a, b) => a + b.count, 0);
  const botShare = Object.entries(radar)
    .filter(([k]) => k.startsWith("bot-share:"))
    .map(([k, pts]) => ({ bot: k.replace("bot-share:", ""), value: pts[pts.length - 1]?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const crawlRefer = Object.entries(radar)
    .filter(([k]) => k.startsWith("crawl-refer:"))
    .map(([k, pts]) => ({ platform: k.replace("crawl-refer:", ""), value: pts[pts.length - 1]?.value ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const operators = Object.entries(radar).filter(([k]) => k.startsWith("operator:"));
  const hasRadar = botShare.length > 0 || operators.length > 0;

  return (
    <div className="shell explorer">
      <PageHeader
        title="Traffic"
        sub="AI systems read the web as well as write to it. This page follows the requests: first what this site sees, then what network operators who watch a large share of the internet publish."
      />
      <StatTiles
        tiles={[
          { value: fmtPct(overview.aiShare7d), label: "AI share of requests to this site, 7 days", sub: `${fmtInt(overview.aiVisits7d)} of ${fmtInt(overview.requests7d)} requests` },
          { value: "4.2%", label: "of HTML requests from AI bots other than Googlebot", sub: "Cloudflare Radar, Dec 2025" },
          { value: "15×", label: "growth in user-triggered AI fetches in 2025", sub: "Cloudflare Radar, Dec 2025" },
          { value: hasRadar ? "live" : "static", label: "Cloudflare Radar data", sub: hasRadar ? "refreshed daily via the Radar API" : "add CLOUDFLARE_API_TOKEN for live charts" },
        ]}
      />

      <div className="section-head">
        <h2>This site</h2>
        <Link className="more" href="/visitors">
          visitor log →
        </Link>
      </div>
      {byDay.some((d) => d.total > 0) ? (
        <>
          <TimelineChart days={days} bars={byDay.map((d) => d.ai)} barLabel="AI requests per day" line={byDay.map((d) => d.total)} lineLabel="All requests" title="AI vs all requests to this site" />
          <p className="label" style={{ margin: "18px 0 8px" }}>
            Who sends requests · 30 days
          </p>
          <BarList rows={breakdown.map((b) => ({ key: b.category, label: CATEGORY_LABELS[b.category] ?? b.category, value: b.count, title: totalBreakdown > 0 ? fmtPct(b.count / totalBreakdown) : "" }))} variant="neutral" />
        </>
      ) : (
        <Empty db={db} />
      )}

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
                Share of bot traffic by bot · last 7 days
              </div>
              <BarList rows={botShare.slice(0, 12).map((b) => ({ key: b.bot, label: b.bot, value: b.value }))} format={(v) => `${v.toFixed(1)}%`} />
            </div>
          ) : null}
          {crawlRefer.length > 0 ? (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Pages crawled per referral · last 7 days
              </div>
              <BarList rows={crawlRefer.map((c) => ({ key: c.platform, label: c.platform, value: c.value }))} format={(v) => `${fmtInt(v)}:1`} variant="neutral" />
            </div>
          ) : null}
          {operators.slice(0, 4).map(([k, pts]) => (
            <MiniChart key={k} days={pts.map((p) => p.period)} values={pts.map((p) => p.value)} label={`${k.replace("operator:", "")} · requests per day`} />
          ))}
        </div>
      ) : (
        <div className="embed-card">
          <h3>Live Radar charts appear here once a free Cloudflare API token is configured.</h3>
          <p>
            Until then, the dashboards are one click away:{" "}
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
        Share of crawler traffic seen by Cloudflare. {fmtDay(days[days.length - 1] ?? "")} is the latest day on this site&apos;s own chart.
      </p>
    </div>
  );
}
