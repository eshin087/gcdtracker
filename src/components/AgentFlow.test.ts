import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_RECORDS } from "@/lib/demo-flow";
import { DEMO_READING, DEMO_SOCIAL } from "@/lib/demo-social";
import { readingFlow, socialFlow } from "@/lib/flow-observatory";
import type { FlowData } from "@/lib/flow";
import { AgentFlow } from "./AgentFlow";

function render(data: FlowData): string {
  return renderToStaticMarkup(createElement(AgentFlow, { data, records: DEMO_RECORDS, showReplay: false }));
}

describe("agent flow observation rendering", () => {
  it("keeps observed-zero sample sources and destination visible without animated traffic", () => {
    const sample = { ...DEMO_SOCIAL.samples.find(row => row.platform === "bluesky")!, sampledPosts: 0, aiDisclosurePosts: 0 };
    const html = render(socialFlow({ mode: "observed", days: [sample.day], samples: [sample] }));
    expect(html).toContain("Bluesky · disclosure matches");
    expect(html).toContain("Bluesky · unclassified");
    // Two evidence partitions plus their destination retain an actual observed zero.
    expect(html.match(/class="flow-count">0 posts<\/text>/g)).toHaveLength(3);
    expect(html.match(/stroke-dasharray="3 5"/g)).toHaveLength(2);
    expect(html).not.toContain("<animateMotion");
    expect(html).not.toContain('class="flow-dot"');
    expect(html).toContain("<dt>Observed value</dt><dd>0 posts</dd>");
    expect(html).toContain("No observations");
    expect(html).not.toContain("NaN");
  });

  it("animates positive aggregate observations without suggesting individual replay examples", () => {
    const html = render(socialFlow(DEMO_SOCIAL));
    expect(html).toContain("<animateMotion");
    expect(html).toContain('class="flow-dot"');
    expect(html).toContain("dots are not individual live events");
    expect(html).not.toContain("No recorded examples");
    expect(html).not.toContain("Replaying");
    expect(html).not.toContain(DEMO_RECORDS[0].target);
    expect(html).toContain("<dt>Observed value</dt><dd>6 posts</dd>");
    expect(html).toContain("<dt>Destination</dt><dd>Bluesky</dd>");
    expect(html).toContain("<dt>Recorded sample outcome</dt>");
  });

  it("renders missing observations as accessible text outside the SVG and fabricates no paths", () => {
    const data = socialFlow({ mode: "offline", days: ["2026-09-07"], samples: [] });
    const html = render(data);
    const svg = html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? "";
    expect(svg).not.toBe("");
    expect(svg).not.toContain(data.emptyMessage);
    expect(html).toContain('<p class="empty">' + data.emptyMessage + "</p>");
    expect(html.indexOf('<p class="empty">')).toBeGreaterThan(html.indexOf("</svg>"));
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<animateMotion");
    expect(html).not.toContain(">0 posts<");
    expect(html).not.toContain("NaN");
  });

  it("retains Radar percentage units in the HTML inspector and destination total", () => {
    const html = render(readingFlow(DEMO_READING, "demo"));
    expect(html).toContain("<dt>Observed value</dt><dd>42% share</dd>");
    expect(html).toContain("<dt>Destination</dt><dd>Cloudflare-observed web</dd>");
    expect(html).toContain('class="flow-count">100% share</text>');
    expect(html).toContain("2026-09-07 UTC");
    expect(html).toContain("share: percent");
  });
});
