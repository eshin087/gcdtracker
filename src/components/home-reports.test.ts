import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HomeReportHeadlines } from "./HomeReports";
import { ActivityHeatmap } from "./HomeCensus";
import type { HomeReportsData } from "@/lib/home-reports";
const data:HomeReportsData = {windowEnd:"2026-09-08",github:[],githubWeek:{days:0,agentPrs:0,prsOpened:0},robots:[],wikimedia:[],daily:[
 {day:"2026-09-07",agentPrs:42,prsOpened:800,hours:21,partial:true,share:null},
 {day:"2026-08-01",agentPrs:9000,prsOpened:10000,hours:24,partial:true,share:null},
]};
it("shows recorded seven-day counts even without certified days",()=>{
 const html=renderToStaticMarkup(createElement(HomeReportHeadlines,{data}));
 expect(html).toContain(">42<");expect(html).toContain(">800<");
 expect(html).toContain("1/7 UTC days observed");expect(html).toContain("0/7 comparable");
 expect(html).not.toContain("9,000");
});
it("renders historical counts and their incomplete coverage by default",()=>{
 const html=renderToStaticMarkup(createElement(ActivityHeatmap,{days:[data.daily[0]],windowEnd:data.windowEnd}));
 expect(html).toContain("42 recorded agent PRs; incomplete or unvalidated coverage");
 expect(html).toContain("fill-opacity:1");expect(html).toContain("UTC days with observations");
 expect(html).not.toContain("No comparable data");
});
