import { describe, expect, it } from "vitest";
import { ROBOTS_TOKENS, validateCrawls } from "./robots-census";
const sample = () => ({id:"CC-MAIN-2026-33",date:"2026-08-12",parserVersion:2,sites:100,files:1,excluded:2,tokens:Object.fromEntries(ROBOTS_TOKENS.map(token=>[token,{mentioned:10,blocked:5}]))});
describe("robots ingestion contract",()=>{
  it("accepts a complete versioned sample",()=>expect(validateCrawls(JSON.stringify({crawls:[sample()]}))).toHaveLength(1));
  it("rejects legacy and partial payloads rather than publishing them",()=>{
    for(const crawls of [[],[sample(),sample()],[{...sample(),parserVersion:1}],[{...sample(),files:0}],[{...sample(),date:"2026-02-30"}],[{...sample(),tokens:{}}]]){
      expect(()=>validateCrawls(JSON.stringify({crawls}))).toThrow();
    }
  });
  it("rejects counts outside the actual sampled denominator",()=>{
    const row=sample();row.tokens[ROBOTS_TOKENS[0]]={mentioned:101,blocked:1};
    expect(()=>validateCrawls(JSON.stringify({crawls:[row]}))).toThrow();
  });
});
