import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f6f7f4",
          color: "#17191c",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontStyle: "italic" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#d9480f" }} />
          {SITE.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -1 }}>Tracking autonomous AI agents on the public internet</div>
          <div style={{ fontSize: 28, color: "#4b5057", fontFamily: "Arial, sans-serif" }}>
            AI crawlers visiting this site · Wikipedia edits flagged as AI · coding-agent pull requests · agent-only forums
          </div>
        </div>
      </div>
    ),
    size,
  );
}
