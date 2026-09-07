import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { toCsv } from "@/lib/csv";
import { exportColumns } from "@/lib/export-columns";
import { visitEvidenceColumns, publicVisit, visitCsvRow, VISIT_CSV_COLUMNS, guestbookEvidenceColumns, publicGuestbookNote, guestbookJson } from "@/lib/public-evidence";
import { db } from "@/lib/db";
import { RADAR_SOURCE } from "@/lib/ingest/radar";
import { getRadarSnapshot } from "@/lib/stats-sources";
import { forumDaily, ghArchiveDaily, githubDaily, githubEvents, guestbookNotes, osmChangesets, trafficDaily, watchedPrs, watchedSignals, mcpServers, externalSeries, agentSightings, visits, wikiEdits } from "@/lib/db/schema";

export const revalidate = 300;

const LIMIT = 50_000;
const CACHE = { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" };

function csv(name: string, body: string) {
  const metadataLink: Record<string, string> = name === "external_series.csv" ? { Link: '</api/export/radar.json>; rel="describedby"; type="application/json"' } : {};
  return new Response(body, { headers: { ...CACHE, ...metadataLink, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}

const noDb = () => NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (name === "agents.json") {
    return NextResponse.json({ generatedAt: new Date().toISOString(), ipSources: IP_SOURCES, agents: CATALOG }, { headers: CACHE });
  }
  if (!db) return noDb();

  switch (name) {
    case "visits.csv": {
      const rows = await db
        .select(visitEvidenceColumns)
        .from(visits)
        .orderBy(desc(visits.ts))
        .limit(LIMIT);
      return csv(name, toCsv(rows.map(publicVisit).map(visitCsvRow), VISIT_CSV_COLUMNS));
    }
    case "traffic_daily.csv": {
      const rows = await db.select(exportColumns.trafficDaily).from(trafficDaily).orderBy(desc(trafficDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.trafficDaily)));
    }
    case "wiki_edits.csv": {
      const rows = await db.select(exportColumns.wikiEdits).from(wikiEdits).orderBy(desc(wikiEdits.ts)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.wikiEdits)));
    }
    case "github_daily.csv": {
      const rows = await db.select(exportColumns.githubDaily).from(githubDaily).orderBy(desc(githubDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.githubDaily)));
    }
    case "github_events.csv": {
      const rows = await db.select(exportColumns.githubEvents).from(githubEvents).orderBy(desc(githubEvents.createdAt)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.githubEvents)));
    }
    case "forum_daily.csv": {
      const rows = await db.select(exportColumns.forumDaily).from(forumDaily).orderBy(desc(forumDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.forumDaily)));
    }
    case "watched_prs.csv": {
      const rows = await db.select(exportColumns.watchedPrs).from(watchedPrs).orderBy(desc(watchedPrs.createdAt)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.watchedPrs)));
    }
    case "watched_signals.csv": {
      const rows = await db.select(exportColumns.watchedSignals).from(watchedSignals).orderBy(desc(watchedSignals.updatedAt)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.watchedSignals)));
    }
    case "osm_changesets.csv": {
      const rows = await db.select(exportColumns.osmChangesets).from(osmChangesets).orderBy(desc(osmChangesets.ts)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.osmChangesets)));
    }
    case "mcp_servers.csv": {
      const rows = await db.select(exportColumns.mcpServers).from(mcpServers).orderBy(desc(mcpServers.publishedAt)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.mcpServers)));
    }
    case "gh_archive_daily.csv": {
      const rows = await db.select(exportColumns.ghArchiveDaily).from(ghArchiveDaily).orderBy(desc(ghArchiveDaily.day), ghArchiveDaily.kind, ghArchiveDaily.key).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.ghArchiveDaily)));
    }
    case "radar.json": {
      const { series, metadata } = await getRadarSnapshot();
      const rows = Object.entries(series).flatMap(([name, points]) => points.map((point) => ({
        source: RADAR_SOURCE, series: name, ...point, fetchedAt: metadata[name.split(":")[0]]?.fetchedAt ?? null,
      })));
      return NextResponse.json({ source: RADAR_SOURCE, rows, metadata }, { headers: CACHE });
    }
    case "external_series.csv": {
      const rows = await db.select(exportColumns.externalSeries).from(externalSeries).orderBy(desc(externalSeries.period)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.externalSeries)));
    }
    case "agent_sightings.csv": {
      const rows = await db.select(exportColumns.agentSightings).from(agentSightings).orderBy(desc(agentSightings.firstSeen)).limit(LIMIT);
      return csv(name, toCsv(rows, Object.keys(exportColumns.agentSightings)));
    }
    case "guestbook.json": {
      const rows = await db
        .select(guestbookEvidenceColumns)
        .from(guestbookNotes)
        .where(eq(guestbookNotes.hidden, false))
        .orderBy(desc(guestbookNotes.ts))
        .limit(LIMIT);
      return NextResponse.json({ notes: rows.map(publicGuestbookNote).map(guestbookJson) }, { headers: CACHE });
    }
    default:
      return NextResponse.json({ ok: false, reason: "unknown-export" }, { status: 404 });
  }
}
