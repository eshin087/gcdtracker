import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { jobOutcome, runJob } from "./common";
import { PayloadTooLarge, readPayload, reportsOutcome } from "./request";

describe("collector outcomes", () => {
  it("adapts legacy disabled/partial results without presenting them as success", () => {
    expect(jobOutcome({ stats: { skipped: "token unavailable" } })).toBe("disabled");
    expect(jobOutcome({ stats: {}, partial: true })).toBe("partial");
    expect(jobOutcome({ stats: { failed: ["upstream"] } })).toBe("failed");
    expect(jobOutcome({ stats: { failures: 1 }, partial: true })).toBe("failed");
    expect(jobOutcome({ stats: { failed: [], failures: 0 } })).toBe("success");
    expect(jobOutcome({ stats: {}, outcome: "failed" })).toBe("failed");
    expect(jobOutcome({ stats: {} })).toBe("success");
  });
  it("never updates run history for status-only reads", async () => {
    const insert = vi.fn();
    const result = await runJob("gharchive", async () => ({ stats: { missing: [] }, outcome: "success" }), { db: { insert } as unknown as Db, deadline: Date.now() + 1000 }, { record: false });
    expect(result.outcome).toBe("success");
    expect(insert).not.toHaveBeenCalled();
  });
  it("persists partial status without marking it as a successful data refresh", async () => {
    const values = vi.fn().mockResolvedValue([]);
    const result = await runJob("mcp", async () => ({ stats: { pages: 2 }, outcome: "partial" }), { db: { insert: () => ({ values }) } as unknown as Db, deadline: Date.now() + 1000 });
    expect(result.ok).toBe(false);
    expect(values.mock.calls[0][0]).toMatchObject({ ok: false, stats: { outcome: "partial", partial: true } });
  });
  it("fails the aggregate when any collector fails", async () => {
    const db = {} as Db;
    const success = await runJob("one", async () => ({ stats: {} }), { db, deadline: 0 }, { record: false });
    const failed = { ...success, source: "two", outcome: "failed" as const, ok: false };
    expect(reportsOutcome([success, failed])).toBe("failed");
    expect(reportsOutcome([{ ...success, outcome: "disabled", ok: false }])).toBe("disabled");
  });
});

describe("ingestion body bounds", () => {
  it("limits bytes rather than JavaScript character count", async () => {
    await expect(readPayload(new Request("https://example.com", { method: "POST", body: "éé" }), 3)).rejects.toBeInstanceOf(PayloadTooLarge);
  });
  it("accepts an exact-size body and declines oversized declared lengths", async () => {
    await expect(readPayload(new Request("https://example.com", { method: "POST", body: "abc" }), 3)).resolves.toBe("abc");
    await expect(readPayload(new Request("https://example.com", { method: "POST", body: "abc", headers: { "content-length": "50" } }), 3)).rejects.toBeInstanceOf(PayloadTooLarge);
  });
});

it("retries a transient GET once but never retries POST or access denials",async()=>{
 const {fetchJson}=await import("./common");
 try{
  const fetch=vi.fn().mockResolvedValueOnce(new Response("bad",{status:502})).mockResolvedValueOnce(Response.json({ok:true}));
  vi.stubGlobal("fetch",fetch);
  expect((await fetchJson("https://example.com",{},1000)).body).toEqual({ok:true});expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockReset().mockResolvedValue(new Response("forbidden",{status:403}));
  expect((await fetchJson("https://example.com")).status).toBe(403);expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockReset().mockResolvedValue(new Response("bad",{status:503}));
  expect((await fetchJson("https://example.com",{method:"POST"})).status).toBe(503);expect(fetch).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllGlobals();}
});
