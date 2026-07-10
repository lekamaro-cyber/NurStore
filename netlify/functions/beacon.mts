import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

/**
 * Compteur de visites maison — sans cookies, sans données personnelles.
 * Reçoit { t: "pv"|"ev", n: "nom" } et incrémente un compteur du jour
 * dans Netlify Blobs. Les bots (UA connus) sont ignorés ; les autres
 * s'excluent d'eux-mêmes car ils n'exécutent pas le JavaScript.
 */
export default async (req: Request) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider|headless|preview|lighthouse/i.test(ua)) {
    return new Response(null, { status: 204 });
  }

  let body: { t?: string; n?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const bucket = body.t === "pv" ? "pages" : "events";
  const name = String(body.n || "").slice(0, 60);
  if (!name) return new Response(null, { status: 400 });

  try {
    const store = getStore("nur-stats");
    const key = "day-" + new Date().toISOString().slice(0, 10);
    const data = JSON.parse((await store.get(key)) || "{}");
    data[bucket] = data[bucket] || {};
    data[bucket][name] = (data[bucket][name] || 0) + 1;
    await store.set(key, JSON.stringify(data));
  } catch (err) {
    console.error("beacon error", err);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  path: "/api/beacon",
};
