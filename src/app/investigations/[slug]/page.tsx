import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { getNote, listNotes } from "@/lib/notes";

export const dynamic = "force-static";

export function generateStaticParams() {
  return listNotes().map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const note = getNote((await params).slug);
  return { title: note?.title ?? "Note", description: note?.summary };
}

export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const note = getNote((await params).slug);
  if (!note) notFound();
  return (
    <div className="shell with-rail">
      <aside className="rail">
        <div className="rail-sticky hidden lg:block">
          <p className="rail-title">{note.kind}</p>
          <ol>
            <li>
              <Link href="/investigations">← all notes</Link>
            </li>
          </ol>
        </div>
      </aside>
      <article className="article prose">
        <h1>{note.title}</h1>
        <p className="meta">
          {note.kind} · {fmtDate(note.date)} · {note.minutes} min read
        </p>
        <div dangerouslySetInnerHTML={{ __html: note.html }} />
        {note.sources.length > 0 ? (
          <div className="footnotes">
            <p className="label">Sources</p>
            <ol>
              {note.sources.map((s) => (
                <li key={s}>
                  <a href={s}>{s}</a>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </article>
    </div>
  );
}
