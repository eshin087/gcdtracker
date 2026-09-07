import type { Metadata } from "next";
import Link from "next/link";
import { FigureHead, PageHeader } from "@/components/ui";
import { AgentFlow } from "@/components/AgentFlow";
import { getFlowData, getLatestRecords } from "@/lib/stats-sources";
import { fmtDate } from "@/lib/format";
import { listNotes } from "@/lib/notes";
import { SITE } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Notes",
  description: "Field notes on what agents leave behind, how the evidence is read, and research briefs on notable cases.",
};

export default async function NotesPage() {
  const notes = listNotes();
  const [flow, records] = await Promise.all([getFlowData(30), getLatestRecords(12)]);
  return (
    <div className="shell explorer">
      <PageHeader title="Notes" sub="Context behind the observations. Each note separates what the public record shows from how we interpret it. Research briefs summarise other people's work and never add records to the totals." />
      {notes.map((n) => (
        <Link key={n.slug} href={`/investigations/${n.slug}`} className="note-card">
          <span className="label">
            {n.kind} · {fmtDate(n.date)} · {n.minutes} min read
          </span>
          <h3>{n.title}</h3>
          <p>{n.summary}</p>
        </Link>
      ))}
      <section aria-labelledby="evidence-map">
        <FigureHead id="evidence-map" title="Evidence sources and destinations" sub="Recorded source counts over 30 completed UTC days. Each source has different coverage and units." />
        <p className="sans dim">Lines connect recorded activity to destinations. Their visual scale is independent for each source and unit. Requests, edits, category additions, changesets and posts cannot be added into one activity measure. The replay shows recorded examples, not live events. See <Link href="/methods">Methods</Link> for attribution limits.</p>
        <AgentFlow data={flow} records={records} />
      </section>
      <p className="dim sans" style={{ fontSize: 12.5, marginTop: 18 }}>
        Notes are markdown files in <a href={`${SITE.repo}/tree/main/content/investigations`}>content/investigations</a>. Corrections and new sources: open an issue.
      </p>
    </div>
  );
}
