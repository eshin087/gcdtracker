import { BlockList, isIP } from "node:net";
import { db } from "@/lib/db";
import { ipRanges } from "@/lib/db/schema";

export type RangeLists = Map<string, BlockList>;

/** Build per-source BlockLists from (source, cidr) rows. Invalid CIDRs are skipped. */
export function buildLists(rows: Array<{ source: string; cidr: string }>): RangeLists {
  const lists: RangeLists = new Map();
  for (const { source, cidr } of rows) {
    const [addr, lenStr] = cidr.split("/");
    const family = isIP(addr);
    if (!family) continue;
    const len = lenStr === undefined ? (family === 6 ? 128 : 32) : Number(lenStr);
    if (!Number.isInteger(len) || len < 0 || len > (family === 6 ? 128 : 32)) continue;
    let list = lists.get(source);
    if (!list) {
      list = new BlockList();
      lists.set(source, list);
    }
    try {
      list.addSubnet(addr, len, family === 6 ? "ipv6" : "ipv4");
    } catch {
      // skip malformed entries
    }
  }
  return lists;
}

export function ipInList(list: BlockList, ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  return list.check(ip, family === 6 ? "ipv6" : "ipv4");
}

const TTL_MS = 30 * 60_000;
let cache: { lists: RangeLists; loadedAt: number } | null = null;
let inflight: Promise<RangeLists | null> | null = null;

async function load(): Promise<RangeLists | null> {
  if (!db) return null;
  const rows = await db.select({ source: ipRanges.source, cidr: ipRanges.cidr }).from(ipRanges);
  const lists = buildLists(rows);
  cache = { lists, loadedAt: Date.now() };
  return lists;
}

/** Cached range lists: 30-minute TTL, one in-flight load, stale-on-error. */
export function getRangeLists(): Promise<RangeLists | null> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return Promise.resolve(cache.lists);
  if (!inflight) {
    inflight = load()
      .catch((err) => {
        console.error("ip-ranges load failed", err);
        return cache?.lists ?? null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export interface Verification {
  /** true inside published ranges, false outside, null unverifiable */
  verified: boolean | null;
  by: string | null;
}

export async function verifyIp(ip: string | null, source: string | undefined): Promise<Verification> {
  if (!ip || !source) return { verified: null, by: null };
  const lists = await getRangeLists();
  const list = lists?.get(source);
  if (!list) return { verified: null, by: null };
  return { verified: ipInList(list, ip), by: `ip-range:${source}` };
}

/** test hook */
export function _resetVerifyCache(): void {
  cache = null;
  inflight = null;
}
