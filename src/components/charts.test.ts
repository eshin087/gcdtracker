import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MiniChart, TimelineChart } from "./charts";

describe("charts with incomplete data", () => {
  it("leaves missing observations as gaps instead of a zero or connecting line", () => {
    const html = renderToStaticMarkup(createElement(TimelineChart, { days: ["2026-09-01", "2026-09-02", "2026-09-03"], bars: [4, null, 7], line: [4, null, 7], barLabel: "requests" }));
    expect(html).not.toContain("2 Sep:");
    const path = html.match(/<path class="line" d="([^"]*)"/)?.[1] ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(html).not.toContain("NaN");
  });
  it("does not crash when a source has unmatched or nonfinite values", () => {
    const props = { days: ["2026-09-01"], bars: [null, 42, Infinity], line: [NaN], barLabel: "requests" };
    expect(renderToStaticMarkup(createElement(TimelineChart, props))).not.toContain("NaN");
    expect(renderToStaticMarkup(createElement(MiniChart, { days: [], values: [42], label: "records" }))).not.toContain("undefined");
  });
  it("does not sum normalized Radar indices", () => {
    const html = renderToStaticMarkup(createElement(MiniChart, { days: ["2026-09-01", "2026-09-02"], values: [0.2, 0.4], label: "Index", summarize: false }));
    expect(html).not.toContain("· 1");
    expect(html).not.toContain('class="mono"');
  });
});
