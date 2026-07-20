import { getStore } from "@netlify/blobs";

/**
 * Intégration Sendcloud : annonce chaque commande payée dans le panneau
 * Sendcloud (adresse pré-remplie, sans achat d'étiquette), puis rattache
 * le point relais choisi par le client.
 *
 * Variables d'environnement requises (Netlify) :
 *  - SENDCLOUD_PUBLIC_KEY : clé publique de l'intégration API
 *  - SENDCLOUD_SECRET_KEY : clé confidentielle de l'intégration API
 *
 * Tout est "best effort" : si Sendcloud est indisponible ou mal configuré,
 * la commande continue normalement (les e-mails restent la source de vérité).
 */

const API = "https://panel.sendcloud.sc/api/v2/parcels";

function authHeader(): string | null {
  const pub = Netlify.env.get("SENDCLOUD_PUBLIC_KEY");
  const sec = Netlify.env.get("SENDCLOUD_SECRET_KEY");
  if (!pub || !sec) return null;
  return "Basic " + btoa(`${pub}:${sec}`);
}

export const sendcloudConfigured = () => authHeader() !== null;

/* Mémorise l'id du colis Sendcloud associé à chaque session Stripe,
   pour pouvoir y rattacher le point relais choisi ensuite. */
const parcelStore = () => getStore("nur-orders");

/** "12 bis rue de la Paix" → { houseNumber: "12 bis", street: "rue de la Paix" } */
export function splitStreet(line1: string): { street: string; houseNumber: string } {
  const m = (line1 || "").trim().match(/^(\d+\s?(?:bis|ter|quater)?)[,\s]+(.+)$/i);
  if (m) return { houseNumber: m[1], street: m[2] };
  return { street: (line1 || "").trim(), houseNumber: "" };
}

export type ParcelInfo = {
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
};

export type AnnounceResult = { ok: boolean; error?: string };

/** Annonce la commande dans Sendcloud (sans acheter l'étiquette). */
export async function announceParcel(info: ParcelInfo): Promise<AnnounceResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, error: "clés non configurées" };
  try {
    const { street, houseNumber } = splitStreet(info.line1);
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        parcel: {
          name: info.name.slice(0, 75) || "Client NUR",
          address: street.slice(0, 75),
          house_number: houseNumber.slice(0, 20),
          address_2: (info.line2 || "").slice(0, 75),
          city: info.city.slice(0, 30),
          postal_code: info.postalCode.slice(0, 12),
          country: info.country || "FR",
          email: info.email.slice(0, 100),
          telephone: (info.phone || "").slice(0, 20),
          order_number: info.sessionId.slice(-12),
          weight: Netlify.env.get("SENDCLOUD_WEIGHT") || "1.000",
          total_order_value: (info.orderValueCents / 100).toFixed(2),
          total_order_value_currency: "EUR",
          request_label: false,
        },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("Sendcloud announce error", res.status, detail);
      return { ok: false, error: `HTTP ${res.status} — ${detail}` };
    }
    const data = await res.json();
    const parcelId = data?.parcel?.id;
    if (parcelId) {
      await parcelStore().set(info.sessionId, String(parcelId));
    }
    return { ok: true };
  } catch (err) {
    console.error("Sendcloud announce failed", err);
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

/** Rattache le point relais choisi (id Sendcloud) à la commande annoncée. */
export async function attachServicePoint(
  sessionId: string,
  servicePointId: number
): Promise<boolean> {
  const auth = authHeader();
  if (!auth) return false;
  try {
    const parcelId = await parcelStore().get(sessionId);
    if (!parcelId) return false;
    const res = await fetch(API, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        parcel: { id: Number(parcelId), to_service_point: servicePointId },
      }),
    });
    if (!res.ok) {
      console.error("Sendcloud service point error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Sendcloud service point failed", err);
    return false;
  }
}
