import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarHeatmap, MultiLine } from "./census-charts";

describe("restored history charts", () => {
  it("breaks lines at unavailable months and labels the latest real observation", () => {
    const html = renderToStaticMarkup(createElement(MultiLine,{title:"History",showPoints:false,series:[{key:"a",label:"Crawler",points:[
      {x:"2015-01-01",y:4},{x:"2015-02-01",y:null},{x:"2015-03-01",y:7},{x:"2015-04-01",y:null},
    ]}]}));
    const path = html.match(/<path d="([^"]*)"/)?.[1] ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(html).toContain("latest observation 2015-03-01: 7");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("<circle");
  });
  it("distinguishes recorded zero, missing dates, and partial coverage", () => {
    const html = renderToStaticMarkup(createElement(CalendarHeatmap,{label:"Daily",days:[
      {day:"2026-09-01",value:0,title:"Recorded zero"},
      {day:"2026-09-03",value:0.8,partial:true,title:"Partial"},
    ]}));
    expect(html).toContain('class="cell observed" data-day="2026-09-01"');
    expect(html).toContain("fill-opacity:0.12");
    expect(html).toContain('class="cell missing" data-day="2026-09-02"');
    expect(html).toContain('class="cell partial" data-day="2026-09-03"');
    expect(html).not.toContain("NaN");
  });
  it("gives separate heatmaps unique hatch patterns", () => {
    const props = {label:"Daily",days:[{day:"2026-09-01",value:null,partial:true,title:"Incomplete"}]};
    const html = renderToStaticMarkup(createElement("div",null,createElement(CalendarHeatmap,props),createElement(CalendarHeatmap,props)));
    const ids = [...html.matchAll(/<pattern id="([^"]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

it("shows partial recorded counts only when explicitly requested", () => {
  const html = renderToStaticMarkup(createElement(CalendarHeatmap,{label:"Counts",showPartialValues:true,days:[
    {day:"2026-09-01",value:42,partial:true,title:"42 recorded PRs; unvalidated"},
  ]}));
  expect(html).toContain('class="cell partial"');
  expect(html).toContain('fill-opacity:1');
  expect(html).toContain('fill="url(#');
});
