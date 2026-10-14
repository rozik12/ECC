import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/articles";
import { TOOL_SLUGS } from "@/lib/tool-defs";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly", lastModified: Date = now) => ({ url: `${base}${path}`, lastModified, changeFrequency, priority });
  return [
    page("", 1, "weekly"),
    page("/tools", 0.9, "monthly"),
    ...TOOL_SLUGS.map((s) => page(`/tools/${s}`, 0.8, "monthly")),
    page("/blog", 0.8, "weekly"),
    ...ARTICLES.map((a) => page(`/blog/${a.slug}`, 0.7, "monthly", new Date(a.date))),
    page("/news", 0.5, "weekly"),
    page("/pricing", 0.5, "monthly"),
    page("/register", 0.4, "monthly"),
    page("/login", 0.2, "monthly"),
    page("/terms", 0.2, "monthly"),
    page("/privacy", 0.2, "monthly"),
  ];
}
