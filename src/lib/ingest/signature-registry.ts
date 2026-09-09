import { sql } from "drizzle-orm";
import type { JobContext } from "./common";
import { fetchJson, timeLeft } from "./common";
import { commitCollectorState, readCollectorState } from "./state";

const API = "https://api.cloudflare.com/client/v4/radar/bots";
export const REGISTRY_KEY = "agentwatch:signature-catalog";
const PAGE_SIZE = 100;
const MAX_DETAILS = 20;
interface Scan extends Record<string, unknown> {
  offset: number; pending: string[]; exhausted: boolean; checked: number; found: number; completedAt?: string;
}
const fresh = ():Scan => ({offset:0,pending:[],exhausted:false,checked:0,found:0});
export function registrySlugs(body: unknown): string[] {
  const b = body as {success?:boolean;result?:{bots?:Array<{slug?:unknown}>}} | null;
  if (b?.success !== true || !Array.isArray(b.result?.bots)) throw new Error("Radar bot catalog missing list");
  return b.result.bots.map(bot => {
    if (!bot || typeof bot.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(bot.slug)) throw new Error("Invalid Radar bot slug");
    return bot.slug;
  });
}
export function registryEntry(body: unknown, slug: string) {
  const b = body as {success?:boolean;result?:{bot?:{slug?:unknown;signatureAgentUrl?:unknown;operator?:unknown}}} | null;
  const bot = b?.result?.bot;
  if (b?.success !== true || !bot || bot.slug !== slug) throw new Error("Radar bot details missing or mismatched");
  if (bot.signatureAgentUrl == null) return null;
  if (typeof bot.signatureAgentUrl !== "string") throw new Error("Invalid signature directory");
  const url = new URL(bot.signatureAgentUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid signature directory");
  return {token:url.host,url:url.href,operator:typeof bot.operator === "string" ? bot.operator : null};
}
/** Catalog discovery only; never evidence that this site verified a signed request. */
export async function collectSignatureRegistry(ctx: JobContext) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return {partial:false,stats:{registry:"disabled",registryReason:"CLOUDFLARE_API_TOKEN not configured"}};
  let snapshot = await readCollectorState<Scan>(ctx.db,REGISTRY_KEY,fresh());
  if (snapshot.state.completedAt && Date.now()-Date.parse(snapshot.state.completedAt)<86_400_000)
    return {partial:false,stats:{registry:"Radar bot API",registryCompletedAt:snapshot.state.completedAt,registryChecked:snapshot.state.checked,signedAgents:snapshot.state.found}};
  if (snapshot.state.completedAt) {
    if (!await commitCollectorState(ctx.db,REGISTRY_KEY,snapshot,fresh())) return {partial:true,stats:{registry:"concurrent refresh"}};
    snapshot=await readCollectorState<Scan>(ctx.db,REGISTRY_KEY,fresh());
  }
  const request = async (url:string) => {
    const result = await fetchJson<unknown>(url,{headers:{authorization:"Bearer "+token}},Math.min(8_000,Math.max(1,timeLeft(ctx)-1_000)));
    if (result.status!==200) throw new Error("Radar bot API HTTP "+result.status);
    return result.body;
  };
  let checked=0;
  while (timeLeft(ctx)>4_000 && checked<MAX_DETAILS) {
    const state=snapshot.state;
    if (!state.pending.length) {
      const slugs=await request(API+`?limit=${PAGE_SIZE}&offset=${state.offset}`).then(registrySlugs);
      const next:Scan={...state,offset:state.offset+slugs.length,pending:slugs,exhausted:slugs.length<PAGE_SIZE};
      if (!slugs.length) next.completedAt=new Date().toISOString();
      if (!await commitCollectorState(ctx.db,REGISTRY_KEY,snapshot,next)) break;
      snapshot={state:next,revision:snapshot.revision+1};
      if (next.completedAt) break;
    }
    const slug=snapshot.state.pending[0];
    const entry=registryEntry(await request(API+"/"+encodeURIComponent(slug)),slug);
    const next:Scan={...snapshot.state,pending:snapshot.state.pending.slice(1),checked:snapshot.state.checked+1,found:snapshot.state.found+(entry?1:0)};
    if (!next.pending.length && next.exhausted) next.completedAt=new Date().toISOString();
    const saved=await commitCollectorState(ctx.db,REGISTRY_KEY,snapshot,next,guard => entry ? [sql`
      insert into agent_sightings(kind,token,operator,fn,url)
      select 'signature-registry',${entry.token},${entry.operator},'Published Web Bot Auth directory',${entry.url} where ${guard}
      on conflict(kind,token) do nothing`] : []);
    if (!saved) break;
    snapshot={state:next,revision:snapshot.revision+1};checked++;
    if (next.completedAt) break;
  }
  return {partial:!snapshot.state.completedAt,stats:{registry:"Radar bot API",registryChecked:snapshot.state.checked,signedAgents:snapshot.state.found,registryCompletedAt:snapshot.state.completedAt ?? null}};
}
