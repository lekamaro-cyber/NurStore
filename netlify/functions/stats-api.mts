import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

/**
 * Lecture des stats (protégée par la variable d'environnement STATS_KEY).
 * GET /api/stats?key=...&days=14 → { "2026-07-08": { pages: {...}, events: {...} }, ... }
 */
export default async (req: Request) => {
  const url = new URL(req.url);
  const secret = Netlify.env.get("STATS_KEY");
  if (!secret || url.searchParams.get("key") !== secret) {
    return Response.json({ error: "Clé invalide." }, { status: 403 });
  }
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days")) || 14));

  const store = getStore("nur-stats");
  const out: Record<string, unknown> = {};
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const raw = await store.get("day-" + day);
    if (raw) out[day] = JSON.parse(raw);
  }
  return Response.json(out);
};

export const config: Config = {
  path: "/api/stats",
};
