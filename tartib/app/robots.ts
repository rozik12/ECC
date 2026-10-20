import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Закрытые разделы (после входа) поисковикам не нужны; всё публичное открыто. */
const PRIVATE = [
  "/dashboard", "/calculator", "/trades", "/rules", "/statistics", "/charts", "/market", "/metals", "/portfolio", "/prop", "/support", "/messages", "/diary",
  "/trader-types", "/notifications", "/profile", "/settings", "/onboarding", "/reset-password", "/admin", "/auth", "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
