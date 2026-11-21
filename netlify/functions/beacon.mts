import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

/**
 * Compteur de visites maison — sans cookies, sans données personnelles.
 * Reçoit { t: "pv"|"ev", n: "nom" } et incrémente un compteur du jour
 * dans Netlify Blobs. Les bots (UA connus) sont ignorés ; les autres
 * s'excluent d'eux-mêmes car ils n'exécutent pas le JavaScript.
 *
 * Provenance : sur les pages vues seulement, on incrémente aussi un compteur
 * par pays, déduit de l'adresse IP par Netlify.
 *
 * Journal (depuis le 21/11/2026, demandé par le fondateur après une pointe de
 * visites inexpliquée) : chaque page vue est aussi consignée en clair dans
 * `log` — heure de Paris, adresse IP, pays, ville, page, page d'origine et
 * famille de navigateur — pour distinguer une vraie visite d'un robot ou d'un
 * scan. Au plus LOG_MAX lignes par jour ; les jours de plus de 60 jours sont
 * effacés à la lecture des stats (stats-api.mts). Déclaré dans les mentions
 * légales, section « Données personnelles ».
 */
const LOG_MAX = 300;

/** « Chrome · Android », « Safari · iPhone »… : assez pour reconnaître un robot, sans garder l'UA entière. */
function navigateur(ua: string): string {
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|python|wget|go-http|java/i.test(ua) ? "script" : "autre";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "?";
  return nav + " · " + os;
}

function heureParis(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
}
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider|headless|preview|lighthouse/i.test(ua)) {
    return new Response(null, { status: 204 });
  }

  let body: { t?: string; n?: string; r?: string };
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
      data.log = Array.isArray(data.log) ? data.log : [];
      if (data.log.length < LOG_MAX) {
        const ip = (context as { ip?: string }).ip || req.headers.get("x-nf-client-connection-ip") || "?";
        let ref = String(body.r || "").slice(0, 120);
        try { if (ref) ref = new URL(ref).host + new URL(ref).pathname.replace(/\/$/, ""); } catch { /* on garde tel quel */ }
        data.log.push({
          h: heureParis(new Date()), ip, pays, ville: String(context.geo?.city || "").slice(0, 40),
          page: name, ref, nav: navigateur(ua),
        });
      }
    }
    await store.set(key, JSON.stringify(data));
  } catch (err) {
    console.error("beacon error", err);
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  // « beacon » est dans les listes des bloqueurs de pub ; l'ancien chemin reste
  // servi pour les pages encore en cache chez les visiteurs.
  path: ["/api/visite", "/api/beacon"],
};
