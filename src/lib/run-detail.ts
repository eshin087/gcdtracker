/**
 * A short public explanation of a collector run.
 *
 * Raw error text never passes through: it can carry hostnames, account names or upstream
 * response bodies. Everything published here is a fixed phrase, a number, a UTC time, or a
 * name or code that matches a strict pattern.
 */

type Stats = Record<string, unknown>;

/** A collector's own group or sub-step name. No dots or slashes, so a host or path never qualifies. */
const STEP = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
/** A public GitHub repository as owner/name. The owner part cannot contain a dot, which excludes host/path strings. */
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
/** The collectors' own reason codes and short phrases: lowercase words only, so no host, number or token fits. */
const PHRASE = /^[a-z][a-z -]{0,59}$/;
/** Environment variable names are public; values never are. */
const SETTING = /^[A-Za-z][A-Za-z_ ]{0,59}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RATIO = /^\d{1,7}\/\d{1,7}$/;
const MAX_LENGTH = 280;

/** Reduces an error message to a fixed vocabulary. Unrecognized text becomes "unexpected error". */
export function failureCode(message: unknown): string {
  const text = typeof message === "string" ? message.slice(0, 500) : "";
  const rejected = text.match(/metadata rejected: ([a-z][a-z ]{0,40})/);
  if (rejected) return `metadata rejected, ${rejected[1].trim()}`;
  const status = text.match(/(?<![\d.])([45]\d\d)(?![\d.])/);
  if (status) return `HTTP ${status[1]}`;
  if (/rate.?limit/i.test(text)) return "rate limited";
  if (/timed? ?out|timeout|abort/i.test(text)) return "timed out";
  if (/superseded|concurrent|contended/i.test(text)) return "concurrent run";
  if (/incomplete|malformed|invalid|missing|mismatch|excessive|unknown|conflicting|non-finite|exceeds/i.test(text)) return "response failed validation";
  if (/fetch failed|network|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(text)) return "network error";
  return "unexpected error";
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const phrase = (value: unknown): string | null => (typeof value === "string" && PHRASE.test(value) ? value : null);
/** "done/wanted" progress, reported only when something wanted was not done. */
function shortfall(value: unknown): string | null {
  if (typeof value !== "string" || !RATIO.test(value)) return null;
  const [done, wanted] = value.split("/").map(Number);
  return done < wanted ? value : null;
}
const count = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

function utcTime(value: unknown): string | null {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(11, 16) + " UTC" : null;
}

function listed(values: string[], pattern: RegExp, limit = 4): string | null {
  const safe = values.filter((value) => pattern.test(value));
  if (!safe.length) return null;
  return safe.slice(0, limit).join(", ") + (safe.length > limit ? ` and ${safe.length - limit} more` : "");
}

/** Entries are "name: message", a bare sub-step name whose message is stored under that key, or a bare message. */
function failures(stats: Stats): string | null {
  const failed = strings(stats.failed);
  if (!failed.length) return null;
  const parts = failed.slice(0, 4).map((entry) => {
    const split = entry.indexOf(": ");
    if (split > 0) {
      const name = entry.slice(0, split);
      return STEP.test(name) || REPO.test(name) ? `${name} (${failureCode(entry.slice(split + 2))})` : failureCode(entry);
    }
    return STEP.test(entry) ? `${entry} (${failureCode(Object.hasOwn(stats, entry) ? stats[entry] : "")})` : failureCode(entry);
  });
  return "failed: " + parts.join(", ") + (failed.length > 4 ? ` and ${failed.length - 4} more` : "");
}

/** Supplementary publisher fields a collector left out, as "group: field, field". */
function omitted(stats: Stats): string | null {
  const parts = strings(stats.metadataDropped).flatMap((entry) => {
    const [group, fields, ...rest] = entry.split(": ");
    const names = (fields ?? "").split(", ");
    return !rest.length && STEP.test(group) && names.every((name) => /^[A-Za-z]{1,30}$/.test(name)) ? [`${group} (${names.join(", ")})`] : [];
  });
  return parts.length ? "publisher metadata left out: " + parts.slice(0, 4).join(", ") : null;
}

function notes(stats: Stats): Array<string | null> {
  const limited = utcTime(stats.rateLimitedUntil);
  const basis = phrase(stats.rateLimitBasis);
  const pending = count(stats.pendingFinals);
  const checked = count(stats.registryChecked);
  const scan = stats.registryScan === "complete" ? null : phrase(stats.registryScan);
  const capped = listed(strings(stats.cappedDays), DAY, 3);
  const pairs: Array<[label: string, value: string | null]> = [
    ["previous day ", shortfall(stats.yesterday)],
    ["final counts ", shortfall(stats.finals)],
    ["provisional counts ", shortfall(stats.provisional)],
    ["catch-up ", typeof stats.catchUp === "string" && /^\d{4}-\d{2}-\d{2} \d{1,4}\/\d{1,4}$/.test(stats.catchUp) ? stats.catchUp : null],
    ["sample feed ", phrase(stats.sampleFeed)],
    ["already attempted today: ", listed(strings(stats.attemptedToday), STEP)],
    ["incomplete: ", listed(strings(stats.unavailable), STEP)],
  ];
  return [
    failures(stats),
    // A successful run's reason only names the bound that ended a sample, which is not news.
    stats.outcome === "success" ? null : phrase(stats.reason),
    phrase(stats.stopped) ? `stopped: ${stats.stopped}` : null,
    limited ? `rate limited until ${limited}${basis ? ` (${basis})` : ""}` : null,
    phrase(stats.notRun) ? `not run: ${stats.notRun}` : null,
    typeof stats.skipped === "string" && SETTING.test(stats.skipped) ? `disabled: ${stats.skipped}` : null,
    stats.alreadyAttempted === true ? "already attempted today" : null,
    ...pairs.map(([label, value]) => (value ? label + value : null)),
    pending ? `${pending} older counts pending` : null,
    stats.reached === false ? "feed walk stopped at its page cap" : null,
    capped ? `lower-bound days: ${capped}` : null,
    scan ? `registry scan ${scan}${checked !== null ? `, ${checked} checked` : ""}` : null,
    omitted(stats),
  ];
}

/** Null when the run has nothing worth explaining. */
export function runDetail(run: { stats: Stats | null; error?: string | null }): string | null {
  const stats = run.stats && typeof run.stats === "object" && !Array.isArray(run.stats) ? run.stats : {};
  const parts = [run.error ? `error: ${failureCode(run.error)}` : null, ...notes(stats)].filter((part): part is string => !!part);
  if (!parts.length) return null;
  const detail = parts.join("; ");
  return detail.length > MAX_LENGTH ? detail.slice(0, MAX_LENGTH - 1).trimEnd() + "…" : detail;
}
