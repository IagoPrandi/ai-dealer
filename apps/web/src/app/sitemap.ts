import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/u, "");
  return ["/play", "/rounds", "/rules", "/leaderboard"].map((path) => ({
    changeFrequency: path === "/play" ? "hourly" as const : "daily" as const,
    priority: path === "/play" ? 1 : 0.8,
    url: `${base}${path}`,
  }));
}
