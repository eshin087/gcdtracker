import type { MetadataRoute } from "next";
import { SITE, TABS } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return TABS.map((t) => ({ url: `${SITE.url}${t.href}`, changeFrequency: "hourly", priority: t.href === "/" ? 1 : 0.7 }));
}
