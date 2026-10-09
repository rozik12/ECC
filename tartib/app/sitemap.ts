import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/articles";
import { TOOL_SLUGS } from "@/lib/tool-defs";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/news", "/tools", ...TOOL_SLUGS.map((s) => `/tools/${s}`), "/blog", ...ARTICLES.map((a) => `/blog/${a.slug}`), "/login", "/register", "/terms", "/privacy"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
