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

  // Remise à zéro complète des compteurs (bouton du tableau de bord).
  if (url.searchParams.get("reset") === "1") {
    let deleted = 0;
    const { blobs } = await store.list({ prefix: "day-" });
    for (const blob of blobs) {
      await store.delete(blob.key);
      deleted++;
    }
    return Response.json({ ok: true, deleted });
  }
  // Le journal des visites contient des adresses IP : on ne garde pas plus de 60 jours.
  const limite = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  try {
    const { blobs } = await store.list({ prefix: "day-" });
    for (const blob of blobs) if (blob.key.slice(4) < limite) await store.delete(blob.key);
  } catch (err) {
    console.error("purge stats", err);
  }
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
