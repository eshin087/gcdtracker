import * as schema from "@/lib/db/schema";

/** Public exports opt in to each field; new schema columns remain private by default. */
export const exportColumns = {
  trafficDaily: {
    day: schema.trafficDaily.day, category: schema.trafficDaily.category, count: schema.trafficDaily.count
  },
  wikiEdits: {
    wiki: schema.wikiEdits.wiki, rcid: schema.wikiEdits.rcid, revId: schema.wikiEdits.revId, ts: schema.wikiEdits.ts, title: schema.wikiEdits.title, user: schema.wikiEdits.user, comment: schema.wikiEdits.comment, tags: schema.wikiEdits.tags, tier: schema.wikiEdits.tier, signals: schema.wikiEdits.signals, oldLen: schema.wikiEdits.oldLen, newLen: schema.wikiEdits.newLen, url: schema.wikiEdits.url
  },
  githubDaily: {
    day: schema.githubDaily.day, agent: schema.githubDaily.agent, prs: schema.githubDaily.prs, tier: schema.githubDaily.tier, final: schema.githubDaily.final, fetchedAt: schema.githubDaily.fetchedAt
  },
  githubEvents: {
    id: schema.githubEvents.id, agent: schema.githubEvents.agent, repo: schema.githubEvents.repo, number: schema.githubEvents.number, title: schema.githubEvents.title, url: schema.githubEvents.url, createdAt: schema.githubEvents.createdAt, fetchedAt: schema.githubEvents.fetchedAt
  },
  forumDaily: {
    day: schema.forumDaily.day, posts: schema.forumDaily.posts, agents: schema.forumDaily.agents
  },
  watchedPrs: {
    id: schema.watchedPrs.id, sourceId: schema.watchedPrs.sourceId, platform: schema.watchedPrs.platform, kind: schema.watchedPrs.kind, title: schema.watchedPrs.title, url: schema.watchedPrs.url, actorLogin: schema.watchedPrs.actorLogin, actorId: schema.watchedPrs.actorId, agentId: schema.watchedPrs.agentId, attribution: schema.watchedPrs.attribution, repository: schema.watchedPrs.repository, state: schema.watchedPrs.state, createdAt: schema.watchedPrs.createdAt, sourceUpdatedAt: schema.watchedPrs.sourceUpdatedAt, lastObservedAt: schema.watchedPrs.lastObservedAt, firstSeenAt: schema.watchedPrs.firstSeenAt, evidence: schema.watchedPrs.evidence, bodyExcerpt: schema.watchedPrs.bodyExcerpt
  },
  watchedSignals: {
    id: schema.watchedSignals.id, activityId: schema.watchedSignals.activityId, ruleId: schema.watchedSignals.ruleId, excerpt: schema.watchedSignals.excerpt, status: schema.watchedSignals.status, reason: schema.watchedSignals.reason, url: schema.watchedSignals.url, reviewedAt: schema.watchedSignals.reviewedAt, updatedAt: schema.watchedSignals.updatedAt
  },
  osmChangesets: {
    id: schema.osmChangesets.id, ts: schema.osmChangesets.ts, user: schema.osmChangesets.user, editor: schema.osmChangesets.editor, aiKind: schema.osmChangesets.aiKind, changes: schema.osmChangesets.changes, comment: schema.osmChangesets.comment, url: schema.osmChangesets.url, collectionVersion: schema.osmChangesets.collectionVersion
  },
  mcpServers: {
    name: schema.mcpServers.name, title: schema.mcpServers.title, description: schema.mcpServers.description, url: schema.mcpServers.url, publishedAt: schema.mcpServers.publishedAt, updatedAt: schema.mcpServers.updatedAt, firstSeen: schema.mcpServers.firstSeen, status: schema.mcpServers.status, syncVersion: schema.mcpServers.syncVersion
  },
  ghArchiveDaily: {
    day: schema.ghArchiveDaily.day, kind: schema.ghArchiveDaily.kind, key: schema.ghArchiveDaily.key, value: schema.ghArchiveDaily.value, hours: schema.ghArchiveDaily.hours
  },
  externalSeries: {
    source: schema.externalSeries.source, series: schema.externalSeries.series, period: schema.externalSeries.period, value: schema.externalSeries.value, lo: schema.externalSeries.lo, hi: schema.externalSeries.hi, fetchedAt: schema.externalSeries.fetchedAt
  },
  agentSightings: {
    id: schema.agentSightings.id, kind: schema.agentSightings.kind, token: schema.agentSightings.token, operator: schema.agentSightings.operator, fn: schema.agentSightings.fn, url: schema.agentSightings.url, firstSeen: schema.agentSightings.firstSeen
  },
};
