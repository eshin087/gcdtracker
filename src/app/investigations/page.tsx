import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { listNotes } from "@/lib/notes";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Notes",
  description: "Field notes on what agents leave behind, how the evidence is read, and research briefs on notable cases.",
};

export default function NotesPage() {
  const notes = listNotes();
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
      <p className="dim sans" style={{ fontSize: 12.5, marginTop: 18 }}>
        Notes are markdown files in <a href={`${SITE.repo}/tree/main/content/investigations`}>content/investigations</a>. Corrections and new sources: open an issue.
      </p>
    </div>
  );
}
