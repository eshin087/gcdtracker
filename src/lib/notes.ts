import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

export interface Note {
  slug: string;
  title: string;
  date: string;
  kind: string;
  summary: string;
  minutes: number;
  html: string;
  sources: string[];
}

const DIR = path.join(process.cwd(), "content", "investigations");

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return { meta, body: m[2] };
}

export function listNotes(): Note[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .map((f) => {
      const raw = readFileSync(path.join(DIR, f), "utf8");
      const { meta, body } = parseFrontMatter(raw);
      const words = body.split(/\s+/).length;
      return {
        slug: f.replace(/\.md$/, ""),
        title: meta.title ?? f,
        date: meta.date ?? "",
        kind: meta.kind ?? "Field note",
        summary: meta.summary ?? "",
        minutes: Math.max(1, Math.round(words / 220)),
        html: marked.parse(body, { async: false }) as string,
        sources: (meta.sources ?? "").split("|").map((s) => s.trim()).filter(Boolean),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getNote(slug: string): Note | undefined {
  return listNotes().find((n) => n.slug === slug);
}
