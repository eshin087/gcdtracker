import { describe, it, expect } from "vitest";
import { DEMO_SOCIAL } from "./demo-social";
import { publicSocialSample, sampleDays } from "./social-report";
describe("public social evidence", () => {
  const fixture = DEMO_SOCIAL.samples[0];
  it("excludes nested private fields and never publishes raw collector state", () => {
    const row = {...fixture,rawPost:"PRIVATE",author:"PRIVATE",coverage:{...fixture.coverage,token:"PRIVATE",reasons:["PRIVATE"],scopes:fixture.coverage.scopes.map(s=>({...s,reason:"PRIVATE"}))}};
    expect(JSON.stringify(publicSocialSample(row))).not.toContain("PRIVATE");
    expect(publicSocialSample(row)?.sampledPosts).toBe(fixture.sampledPosts);
  });
  it("rejects inconsistent counters and unrecognized origins", () => {
    expect(publicSocialSample({...fixture, aiDisclosurePosts: fixture.sampledPosts+1})).toBeNull();
    expect(publicSocialSample({...fixture, scopes:["https://private.example"]})).toBeNull();
  });
  it("distinguishes missing, zero matches and unmeasured bot status", () => {
    expect(publicSocialSample(undefined)).toBeNull();
    expect(publicSocialSample({...fixture,aiDisclosurePosts:0})?.aiDisclosurePosts).toBe(0);
    expect(publicSocialSample({...fixture, automatedAccountPosts:0})?.automatedAccountPosts).toBeNull();
    expect(publicSocialSample({...fixture,sampledPosts:0,aiDisclosurePosts:0})?.sampledPosts).toBe(0);
  });
  it("uses UTC sampling dates including the current sampling date", () => {
    expect(sampleDays("2026-03-01",3)).toEqual(["2026-02-27","2026-02-28","2026-03-01"]);
  });
});
