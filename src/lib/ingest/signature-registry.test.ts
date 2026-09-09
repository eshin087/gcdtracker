import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db";
import { collectSignatureRegistry, registryEntry, registrySlugs } from "./signature-registry";
import { readCollectorState, commitCollectorState } from "./state";
vi.mock("./state",()=>({readCollectorState:vi.fn(),commitCollectorState:vi.fn()}));
const original=process.env.CLOUDFLARE_API_TOKEN;
let state:Record<string,unknown>,revision:number;
const detail=(slug:string,url:string|null=null)=>({success:true,result:{bot:{slug,signatureAgentUrl:url,operator:"Example"}}});
const ctx=()=>({db:{} as Db,deadline:Date.now()+60_000});
beforeEach(()=>{
 process.env.CLOUDFLARE_API_TOKEN="test-only";state={offset:0,pending:[],exhausted:false,checked:0,found:0};revision=0;
 vi.mocked(readCollectorState).mockImplementation(async()=>({state,revision}));
 vi.mocked(commitCollectorState).mockImplementation(async(_db,_key,snapshot,next)=>{if(snapshot.revision!==revision)return false;state=next;revision++;return true;});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();if(original===undefined)delete process.env.CLOUDFLARE_API_TOKEN;else process.env.CLOUDFLARE_API_TOKEN=original;});
describe("authenticated signature catalog",()=>{
 it("validates API objects and only accepts HTTPS directory URLs",()=>{
  expect(registrySlugs({success:true,result:{bots:[{slug:"gptbot"}]}})).toEqual(["gptbot"]);
  expect(()=>registrySlugs({success:false,result:{bots:[]}})).toThrow();
  expect(()=>registrySlugs({success:true,result:{bots:[{slug:"../secrets"}]}})).toThrow();
  expect(registryEntry(detail("example"),"example")).toBeNull();
  expect(registryEntry(detail("example","https://example.com/.well-known/keys"),"example")).toMatchObject({token:"example.com"});
  expect(()=>registryEntry(detail("example","http://example.com"),"example")).toThrow();
  expect(()=>registryEntry(detail("different"),"example")).toThrow();
 });
 it("bounds detail requests, then resumes without refetching the first page",async()=>{
  const slugs=Array.from({length:21},(_,i)=>"bot-"+i);
  const fetch=vi.fn(async(input:string)=>Response.json(input.includes("?")?{success:true,result:{bots:slugs.map(slug=>({slug}))}}:detail(input.split("/").at(-1)!,"https://"+input.split("/").at(-1)+".example/keys")));
  vi.stubGlobal("fetch",fetch);
  expect((await collectSignatureRegistry(ctx())).partial).toBe(true);
  expect(state.pending).toEqual(["bot-20"]);expect(state.completedAt).toBeUndefined();
  expect((await collectSignatureRegistry(ctx())).partial).toBe(false);
  expect(fetch.mock.calls.filter(([url])=>url.includes("?")).length).toBe(1);
  expect(fetch.mock.calls).toHaveLength(22);expect(state.checked).toBe(21);
  expect((await collectSignatureRegistry(ctx())).partial).toBe(false);expect(fetch.mock.calls).toHaveLength(22);
 });
 it("does not advance past a failed detail and retries that item next run",async()=>{
  state={offset:1,pending:["example"],exhausted:true,checked:0,found:0};
  const fetch=vi.fn().mockResolvedValueOnce(new Response("denied",{status:403})).mockResolvedValueOnce(Response.json(detail("example")));
  vi.stubGlobal("fetch",fetch);
  await expect(collectSignatureRegistry(ctx())).rejects.toThrow("403");expect(state.pending).toEqual(["example"]);
  expect((await collectSignatureRegistry(ctx())).partial).toBe(false);
 });
 it("does not claim a successful scan if checkpoint commit loses a race",async()=>{
  state={offset:1,pending:["example"],exhausted:true,checked:0,found:0};
  vi.mocked(commitCollectorState).mockResolvedValue(false);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json(detail("example"))));
  expect((await collectSignatureRegistry(ctx())).partial).toBe(true);expect(state.pending).toEqual(["example"]);
 });
});
