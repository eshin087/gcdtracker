import { SaveButton } from "@/components/SaveButton";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { BarList, Empty, PageHeader, Segmented, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtStamp, relTime } from "@/lib/format";
import { getForumByDay, getForumPosts, getOverview, hasDatabase } from "@/lib/stats";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Forums",
  description: "Public posts and platform-reported account activity on Moltbook.",
};

const VIEWS = ["day", "posts"] as const;
type View = (typeof VIEWS)[number];

export default async function ForumsPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  if (segments?.length === 1 && segments[0] === "guestbook") redirect("/forums");
  const v = segments?.[0] ?? "day";
  if (!(VIEWS as readonly string[]).includes(v) || (segments?.length ?? 0) > 1) notFound();
  const view = v as View;

  const db = hasDatabase();
  const [overview, byDay] = await Promise.all([getOverview(), getForumByDay(60)]);
  const latest = [...byDay].reverse().find((d) => d.posts > 0);

  const tiles = [
    { value: fmtInt(overview.forumPosts7d), label: "Moltbook posts, 7 days", sub: "platform-reported activity; authorship unverified" },
    { value: latest ? fmtInt(latest.agents) : "–", label: "distinct posting accounts", sub: latest ? `on ${fmtDay(latest.day)}` : undefined },
  ];

  const seg = [
    { href: "/forums", label: "By day", active: view === "day" },
    { href: "/forums/posts", label: "Recent posts", active: view === "posts" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="Forums"
        sub="Moltbook describes itself as a social network for AI agents. We count public posts and account identities reported by its platform; independent AI authorship is not verified."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="Forum views" />
      {view === "day" ? <ByDay byDay={byDay} db={db} /> : null}
      {view === "posts" ? <Posts db={db} /> : null}
    </div>
  );
}

function ByDay({ byDay, db }: { byDay: Awaited<ReturnType<typeof getForumByDay>>; db: boolean }) {
  if (!byDay.some((d) => d.posts > 0)) return <Empty db={db}>The Moltbook poller runs every 30 minutes.</Empty>;
  const days = byDay.map((d) => d.day);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={days} values={byDay.map((d) => d.posts)} label="Posts per day" />
        <MiniChart days={days} values={byDay.map((d) => d.agents)} label="Distinct agents per day" />
      </div>
      <BarList rows={[...byDay].reverse().map((d) => ({ key: d.day, label: fmtDay(d.day), value: d.posts, title: `${fmtInt(d.agents)} agents` }))} />
    </>
  );
}

async function Posts({ db }: { db: boolean }) {
  const rows = await getForumPosts(50);
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <div>
      {rows.map((p) => (
        <div className="note" key={p.id}>
          <div className="who">
            <strong className="mono">{p.agent}</strong>
            {p.board ? <span>in {p.board}</span> : null}
            <span title={fmtStamp(p.ts)}>{relTime(p.ts)}</span>
            {p.score !== null ? <span>↑ {fmtInt(p.score)}</span> : null}
            {p.comments !== null ? <span>{fmtInt(p.comments)} comments</span> : null}
            <SaveButton item={{ id: `forum-${p.id}`, kind: "forum", title: p.title, url: p.url, sub: p.agent }} />
          </div>
          <a href={p.url} style={{ color: "var(--ink)", fontWeight: 500 }}>
            {p.title}
          </a>
          {p.snippet ? (
            <div className="text dim" style={{ marginTop: 4, fontSize: 13 }}>
              {p.snippet}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
