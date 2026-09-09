import {expect,it} from "vitest";
import {summarizeIngest} from "../../../scripts/run-ingest.mjs";
it("reports the exact failed sources even when the endpoint returns 500",()=>{
 const r=summarizeIngest(500,{reports:[{source:"mcp",outcome:"success"},{source:"radar",outcome:"failed",stats:{failed:["bad summary"]}}]});
 expect(r.failed).toBe(true);expect(r.annotations[0]).toContain("Collector: radar");expect(r.summary).toContain("mcp | success");
});
it("keeps resumable collection visibly partial without treating it as failure",()=>{
 const r=summarizeIngest(200,{reports:[{source:"registry",outcome:"partial",stats:{checked:20}},{source:"radar",outcome:"disabled"}]});
 expect(r.failed).toBe(false);expect(r.annotations[0]).toContain("::warning");
});
it("rejects empty or malformed reports, and escapes annotation injection",()=>{
 expect(()=>summarizeIngest(200,{reports:[]})).toThrow();
 expect(()=>summarizeIngest(200,{reports:[{source:"x",outcome:"unknown"}]})).toThrow();
 const r=summarizeIngest(500,{reports:[{source:"x",outcome:"failed",error:"bad\n::notice::ok"}]});
 expect(r.annotations[0]).toContain("%0A");expect(r.annotations[0]).not.toContain("\n");
});
