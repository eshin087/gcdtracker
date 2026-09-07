import type { Metadata } from "next";
import Link from "next/link";
import { TimelineChart } from "@/components/charts";
import { type LineSeries, MultiLine } from "@/components/census-charts";
import { Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtInt, fmtPct } from "@/lib/format";
import { BASELINE } from "@/lib/ingest/baseline";
import { hasDatabase } from "@/lib/stats";
import { AI_MARKERS, fmtMonth, getArchiveMonthly, getRobotsCensus, isPartialArchive } from "@/lib/stats-census";
import { getSeries, type SeriesPoint } from "@/lib/stats-sources";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Before and after",
  description: "Reading, asking, coding and crawling on the public internet, with a baseline from before AI: Wikipedia reads by humans and bots, Stack Overflow questions, GitHub pull requests, and robots.txt blocking since 2019.",
};

const billions = (v: number) => (v === 0 ? "0" : `${(v / 1e9).toFixed(v >= 10e9 ? 0 : 1)}B`);
const monthDay = (m: string) => `${m}-01`;
const at = (pts: SeriesPoint[], period: string) => pts.find((p) => p.period === period)?.value ?? null;
const change = (now: number | null, then: number | null) => (now !== null && then !== null && then > 0 ? (now - then) / then : null);
const signed = (x: number | null) => (x === null ? "–" : `${x >= 0 ? "+" : "−"}${fmtPct(Math.abs(x), 0)}`);

export default async function BeforeAfterPage() {
  const db = hasDatabase();
  const [wm, so, sc, monthly, census] = await Promise.all([getSeries("wm-pageviews"), getSeries("stackoverflow"), getSeries("statcounter"), getArchiveMonthly(), getRobotsCensus()]);

  const user = wm["all-projects:user"] ?? [];
  const spider = wm["all-projects:spider"] ?? [];
  const automated = wm["all-projects:automated"] ?? [];
  const questions = so.questions ?? [];
  const google = sc.google ?? [];
  const latestWm = user.at(-1)?.period ?? null;
  const yearAgoOf = (m: string | null) => (m ? `${Number(m.slice(0, 4)) - 3}${m.slice(4)}` : null); // same month, three years earlier (pre-ChatGPT)
  const botShareNow = latestWm ? (() => {
    const u = at(user, latestWm) ?? 0;
    const b = (at(spider, latestWm) ?? 0) + (at(automated, latestWm) ?? 0);
    return u + b > 0 ? b / (u + b) : null;
  })() : null;
  const humanChange = latestWm ? change(at(user, latestWm), at(user, yearAgoOf(latestWm)!)) : null;
  const latestSo = questions.at(-1) ?? null;
  const soChange = latestSo ? change(latestSo.value, at(questions, "2022-11")) : null;
  const latestGoogle = google.at(-1) ?? null;
  const googleThen = at(google, "2022-11");

  const wmSeries: LineSeries[] = [
    { key: "user", label: "Humans", style: "accent" as const, points: user.map((p) => ({ x: monthDay(p.period), y: p.value })) },
    { key: "spider", label: "Declared crawlers", style: "ink" as const, points: spider.map((p) => ({ x: monthDay(p.period), y: p.value })) },
    { key: "automated", label: "Undeclared bots", style: "control" as const, points: automated.map((p) => ({ x: monthDay(p.period), y: p.value })) },
  ].filter((s) => s.points.length > 0);

  const pct = (c: (typeof census)[number], t: string) => (c.sites > 0 ? (100 * (c.tokens[t]?.blocked ?? 0)) / c.sites : 0);
  const robotsSeries: LineSeries[] = [
    { key: "GPTBot", label: "GPTBot", style: "accent" as const },
    { key: "ClaudeBot", label: "ClaudeBot", style: "ink" as const },
    { key: "CCBot", label: "CCBot", style: "ink" as const },
    { key: "Googlebot", label: "Googlebot", style: "control" as const },
    { key: "Bingbot", label: "Bingbot", style: "control" as const },
  ].map((s) => ({ ...s, points: census.map((c) => ({ x: c.date, y: pct(c, s.key) })) }));

  const tiles = [
    { value: botShareNow !== null ? fmtPct(botShareNow) : "–", label: "of Wikimedia page views now come from bots", sub: latestWm ? `${fmtMonth(monthDay(latestWm))} · declared crawlers plus undeclared automation` : "Wikimedia pageviews API" },
    { value: signed(humanChange), label: "human Wikimedia reads vs three years earlier", sub: latestWm ? `${fmtMonth(monthDay(latestWm))} against ${fmtMonth(monthDay(yearAgoOf(latestWm)!))}` : undefined },
    { value: signed(soChange), label: "Stack Overflow questions per month since ChatGPT", sub: latestSo ? `${fmtInt(latestSo.value)} in ${fmtMonth(monthDay(latestSo.period))} vs ${fmtInt(at(questions, "2022-11") ?? 0)} in Nov 2022` : undefined },
    { value: latestGoogle ? `${latestGoogle.value.toFixed(1)}%` : "–", label: "Google's share of searches", sub: latestGoogle && googleThen !== null ? `${fmtMonth(monthDay(latestGoogle.period))} · ${googleThen.toFixed(1)}% in Nov 2022 · StatCounter, quoted` : "StatCounter, quoted" },
  ];

  const empty = wmSeries.length === 0 && questions.length === 0;

  return (
    <div className="shell explorer">
      <PageHeader
        title="Before and after"
        sub="Four things people did on the public internet before AI assistants existed, measured the same way before and after: reading Wikipedia, asking Stack Overflow, opening pull requests on GitHub, and telling crawlers to go away. Every chart carries the same two markers: ChatGPT's launch and the first AI training crawler token."
      />
      <StatTiles tiles={tiles} />
      {empty ? (
        <Empty db={db}>The baseline job runs with every ingest and backfills these series on its first pass.</Empty>
      ) : null}

      <div className="section-head">
        <h2>Reading: Wikimedia page views by who is reading</h2>
        <a className="more" href="https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews">
          Wikimedia pageviews API ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Every request to every Wikimedia project, per month, split by the Foundation&apos;s own classifier: humans, declared crawlers (Googlebot, GPTBot and the
        like, by user agent), and undeclared automation (traffic that behaves like a bot while claiming to be a browser; classified since 2020). Bot reads climbed
        while human reads did not, which is the scraping wave in one picture.
      </p>
      {wmSeries.length > 0 ? (
        <figure className="home-chart">
          <MultiLine series={wmSeries} format={billions} title="Wikimedia page views per month by agent type" annotations={AI_MARKERS} labelWidth={150} />
          <figcaption>Views per month across all Wikimedia projects, all access methods. Rung: quoted source (Wikimedia Analytics).</figcaption>
        </figure>
      ) : (
        <Empty db={db} />
      )}

      <div className="section-head">
        <h2>Asking: Stack Overflow questions per month</h2>
        <a className="more" href="https://api.stackexchange.com/docs">
          Stack Exchange API ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Questions asked on Stack Overflow each month, counted from the public API. The place developers went for answers before assistants existed; the
        drop after November 2022 is the clearest single measure of where those questions went.
      </p>
      {questions.length > 0 ? (
        <figure className="home-chart">
          <TimelineChart
            days={questions.map((p) => monthDay(p.period))}
            bars={questions.map((p) => p.value)}
            barLabel="Questions asked per month"
            annotations={AI_MARKERS.map((a) => ({ ...a, day: `${a.day.slice(0, 7)}-01` })).filter((a) => questions.some((p) => p.period === a.day.slice(0, 7)))}
            title="Stack Overflow questions per month"
            xLabel={fmtMonth}
            height={240}
          />
          <figcaption>Counts as the API reports them today, so months lose deleted questions over time. Rung: quoted source.</figcaption>
        </figure>
      ) : (
        <Empty db={db} />
      )}

      <div className="section-head">
        <h2>Coding: pull requests on GitHub, all and by agents</h2>
        <Link className="more" href="/github">
          the census →
        </Link>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        The GH Archive census counts every pull request opened on GitHub per month; agent pull requests are the ones opened by a known coding-agent
        account or on an agent branch prefix. The years before 2025 are the human baseline; the AI co-author trailers in commit messages during that time are on
        the census page.
      </p>
      {monthly.length > 1 ? (
        <figure className="home-chart">
          <TimelineChart
            days={monthly.map((m) => monthDay(m.period))}
            bars={monthly.map((m) => m.agentPrs)}
            barLabel="Agent PRs opened per month"
            line={monthly.map((m) => m.prsOpened)}
            lineLabel="All PRs opened per month"
            annotations={AI_MARKERS.map((a) => ({ ...a, day: `${a.day.slice(0, 7)}-01` })).filter((a) => monthly.some((m) => m.period === a.day.slice(0, 7)))}
            title="Pull requests per month: all of GitHub and by agents"
            xLabel={fmtMonth}
            muted={monthly.map(isPartialArchive)}
            height={240}
          />
          <figcaption>
            Pale bars: months where GH Archive captured only part of GitHub&apos;s feed. Rung: bot account and branch fingerprint. Earliest month counted so far: {fmtMonth(monthDay(monthly[0].period))}.
          </figcaption>
        </figure>
      ) : (
        <Empty db={db} />
      )}

      <div className="section-head">
        <h2>Crawling: who the web blocks, search engines against AI</h2>
        <Link className="more" href="/traffic">
          the robots.txt census →
        </Link>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Share of sampled sites whose robots.txt fully blocks each crawler, per Common Crawl crawl. Googlebot and Bingbot have been blockable for two decades and
        almost never are; the AI crawlers went from nonexistent to the most-blocked identities on the web within three years.
      </p>
      {census.length > 1 ? (
        <figure className="home-chart">
          <MultiLine series={robotsSeries} format={(v) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`} title="Share of sampled sites fully blocking each crawler" annotations={AI_MARKERS} height={240} />
          <figcaption>
            About 40,000 sites sampled per crawl; whole-web shares. Earliest crawl counted so far: {census[0].date.slice(0, 7)}. Rung: quoted source plus this site&apos;s own sample.
          </figcaption>
        </figure>
      ) : (
        <Empty db={db} />
      )}

      {google.length > 1 ? (
        <>
          <div className="section-head">
            <h2>Searching: Google&apos;s share of searches</h2>
            <a className="more" href="https://gs.statcounter.com/search-engine-market-share">
              StatCounter ↗
            </a>
          </div>
          <p className="page-sub" style={{ maxWidth: "72ch" }}>
            StatCounter&apos;s monthly search-engine market share, worldwide, from browser-side sampling on its member sites. Quoted as published; it measures
            searches on search engines, so questions that moved to assistants simply disappear from it.
          </p>
          <figure className="home-chart">
            <MultiLine
              series={[
                { key: "google", label: "Google", style: "accent" as const, points: google.map((p) => ({ x: monthDay(p.period), y: p.value })) },
                { key: "bing", label: "Bing", style: "ink" as const, points: (sc.bing ?? []).map((p) => ({ x: monthDay(p.period), y: p.value })) },
              ].filter((s) => s.points.length > 0)}
              format={(v) => `${v.toFixed(0)}%`}
              yMax={100}
              title="Search-engine market share, worldwide"
              annotations={AI_MARKERS}
              height={220}
            />
            <figcaption>
              Source: <a href={BASELINE.statcounter.replace("/chart.php", "")}>StatCounter GlobalStats</a>. Rung: quoted source.
            </figcaption>
          </figure>
        </>
      ) : null}
    </div>
  );
}
