import type { MetadataRoute } from "next";
import { ALL_LINKS, SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ALL_LINKS.filter((l) => l.href !== "/saved").map((l) => ({
    url: `${SITE.url}${l.href}`,
    changeFrequency: "hourly",
    priority: l.href === "/" ? 1 : 0.7,
  }));
}
