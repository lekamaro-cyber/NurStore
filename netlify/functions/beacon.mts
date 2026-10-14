import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

/**
 * Compteur de visites maison — sans cookies, sans données personnelles.
 * Reçoit { t: "pv"|"ev", n: "nom" } et incrémente un compteur du jour
 * dans Netlify Blobs. Les bots (UA connus) sont ignorés ; les autres
 * s'excluent d'eux-mêmes car ils n'exécutent pas le JavaScript.
 *
 * Provenance : sur les pages vues seulement, on incrémente aussi un compteur
 * par pays, déduit de l'adresse IP par Netlify. On ne retient que le code à
 * deux lettres — jamais l'IP, la ville ni les coordonnées, qui sont pourtant
 * dans `context.geo`. Un compteur « FR: 312 » ne désigne personne, et c'est
 * tout ce qu'il faut pour savoir si la boutique parle au bon public.
 */
export default async (req: Request, context: Context) => {
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
  const estPageVue = body.t === "pv";
  const bucket = estPageVue ? "pages" : "events";
  const name = String(body.n || "").slice(0, 60);
  if (!name) return new Response(null, { status: 400 });

  // Code ISO à deux lettres, ou "??" quand Netlify ne sait pas conclure.
  const code = (context.geo?.country?.code || "").toUpperCase();
  const pays = /^[A-Z]{2}$/.test(code) ? code : "??";

  try {
    const store = getStore("nur-stats");
    const key = "day-" + new Date().toISOString().slice(0, 10);
    const data = JSON.parse((await store.get(key)) || "{}");
    data[bucket] = data[bucket] || {};
    data[bucket][name] = (data[bucket][name] || 0) + 1;
    if (estPageVue) {
      data.pays = data.pays || {};
      data.pays[pays] = (data.pays[pays] || 0) + 1;
    }
    await store.set(key, JSON.stringify(data));
  } catch (err) {
    console.error("beacon error", err);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  path: "/api/beacon",
};
