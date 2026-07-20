import { getStore } from "@netlify/blobs";

/**
 * Intégration Sendcloud (Orders API v3) : importe chaque commande payée
 * dans le panneau Sendcloud (« Commandes importées », adresse pré-remplie).
 * Les comptes récents n'ont plus accès à la création de colis via l'API v2.
 *
 * Variables d'environnement requises (Netlify) :
 *  - SENDCLOUD_PUBLIC_KEY : clé publique de l'intégration API
 *  - SENDCLOUD_SECRET_KEY : clé confidentielle de l'intégration API
 * Optionnelle :
 *  - SENDCLOUD_INTEGRATION_ID : id de l'intégration (sinon découvert via
 *    l'API et mis en cache ; visible aussi dans l'URL du panneau Sendcloud,
 *    Réglages → Intégrations → Modifier).
 *
 * Tout est "best effort" : si Sendcloud est indisponible ou mal configuré,
 * la commande continue normalement (les e-mails restent la source de vérité).
 */

const PANEL = "https://panel.sendcloud.sc";

function authHeader(): string | null {
  const pub = Netlify.env.get("SENDCLOUD_PUBLIC_KEY");
  const sec = Netlify.env.get("SENDCLOUD_SECRET_KEY");
  if (!pub || !sec) return null;
  return "Basic " + btoa(`${pub}:${sec}`);
}

export const sendcloudConfigured = () => authHeader() !== null;

const orderStore = () => getStore("nur-orders");

/** "12 bis rue de la Paix" → { houseNumber: "12 bis", street: "rue de la Paix" } */
export function splitStreet(line1: string): { street: string; houseNumber: string } {
  const m = (line1 || "").trim().match(/^(\d+\s?(?:bis|ter|quater)?)[,\s]+(.+)$/i);
  if (m) return { houseNumber: m[1], street: m[2] };
  return { street: (line1 || "").trim(), houseNumber: "" };
}

/** Id de l'intégration API (env → cache → découverte via l'API). */
async function integrationId(auth: string): Promise<number | null> {
  const override = Netlify.env.get("SENDCLOUD_INTEGRATION_ID");
  if (override) return Number(override);
  try {
    const cached = await orderStore().get("integration-id");
    if (cached) return Number(cached);
  } catch {}
  for (const url of [`${PANEL}/api/v3/integrations`, `${PANEL}/api/v2/integrations`]) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) continue;
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : data?.data ?? data?.integrations ?? [];
      const api = list.find((i) => i?.system === "api") ?? list[0];
      if (api?.id) {
        try { await orderStore().set("integration-id", String(api.id)); } catch {}
        return api.id;
      }
    } catch (err) {
      console.error("Sendcloud integrations fetch failed", url, err);
    }
  }
  return null;
}

export type OrderItem = {
  name: string;
  quantity: number;
  totalCents: number;
};

export type OrderInfo = {
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string; // ISO-2, ex. "FR"
  orderValueCents: number;
  items: OrderItem[];
  /** Méthode de livraison choisie au paiement (ex. "Mondial Relay — point relais"). */
  shippingMethod?: string;
};

export type AnnounceResult = { ok: boolean; error?: string };

const price = (cents: number) => ({
  currency: "EUR",
  value: Number((cents / 100).toFixed(2)),
});

/** Importe la commande dans Sendcloud (Orders API v3). */
export async function announceOrder(info: OrderInfo): Promise<AnnounceResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, error: "clés non configurées" };
  try {
    const intId = await integrationId(auth);
    if (!intId) return { ok: false, error: "intégration API introuvable (renseigner SENDCLOUD_INTEGRATION_ID)" };
    const { houseNumber } = splitStreet(info.line1);
    const order = {
      order_id: info.sessionId.slice(-64), // 64 caractères max côté Sendcloud
      order_number: "NUR-" + info.sessionId.slice(-6).toUpperCase(),
      order_details: {
        integration: { id: intId },
        status: { code: "fulfilled", message: "Fulfilled" },
        order_created_at: new Date().toISOString(),
        order_items: info.items.map((it) => ({
          name: it.name.slice(0, 100),
          quantity: it.quantity,
          total_price: price(it.totalCents),
        })),
      },
      payment_details: {
        total_price: price(info.orderValueCents),
        status: { code: "paid", message: "Paid" },
      },
      shipping_address: {
        name: info.name.slice(0, 75) || "Client NUR",
        address_line_1: info.line1.slice(0, 75),
        address_line_2: (info.line2 || "").slice(0, 75),
        house_number: houseNumber.slice(0, 20),
        postal_code: info.postalCode.slice(0, 12),
        city: info.city.slice(0, 30),
        country_code: info.country || "FR",
        email: info.email.slice(0, 100),
        phone_number: (info.phone || "").slice(0, 20),
      },
      shipping_details: {
        is_local_pickup: false,
        // Indique à Sendcloud la méthode choisie au paiement, pour que la
        // suggestion de transporteur soit la bonne (sinon il devine).
        ...(info.shippingMethod
          ? { delivery_indicator: info.shippingMethod.slice(0, 100) }
          : {}),
        measurement: {
          // L'Orders API v3 n'accepte que le poids ici (les dimensions ont été
          // refusées : "Extra inputs are not permitted"). Elles se règlent au
          // moment de l'étiquette, ou via un format de colis par défaut dans
          // Sendcloud (Réglages).
          weight: {
            value: Number(Netlify.env.get("SENDCLOUD_WEIGHT") || "0.6"),
            unit: "kg",
          },
        },
      },
    };
    const res = await fetch(`${PANEL}/api/v3/orders`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify([order]),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 1500);
      console.error("Sendcloud order import error", res.status, detail);
      return { ok: false, error: `HTTP ${res.status} — ${detail}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("Sendcloud order import failed", err);
    return { ok: false, error: String(err).slice(0, 300) };
  }
}
