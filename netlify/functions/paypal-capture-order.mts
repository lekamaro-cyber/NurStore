import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { capturerCommande, paypalConfigured, paypalEnv } from "../lib/paypal.mts";
import { traiterCommande, type CommandePayee } from "../lib/fulfilment.mts";

/**
 * Encaisse une commande PayPal approuvée par l'acheteur, puis la fait entrer
 * dans la même chaîne de traitement que les commandes Stripe.
 *
 * Deux garde-fous contre le double traitement : PayPal refuse lui-même une
 * seconde capture, et le détail rangé en Blobs porte un drapeau `traite`. Le
 * second protège du cas où la capture réussit mais où la réponse se perd en
 * route — le navigateur réessaie, et la commande ne part pas deux fois.
 */
export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!paypalConfigured()) return Response.json({ error: "PayPal non configuré." }, { status: 503 });

  let body: { orderID?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const orderID = String(body.orderID ?? "").trim();
  if (!orderID) return Response.json({ error: "Commande absente." }, { status: 400 });

  const store = getStore("nur-paypal-orders");
  const detail = (await store.get(orderID, { type: "json" }).catch(() => null)) as
    | {
        reference: string;
        articles: { nom: string; quantite: number; totalCents: number }[];
        livraison: { libelle: string; montantCents: number; pointRelais: boolean };
        totalCents: number;
        traite?: boolean;
      }
    | null;

  if (!detail) {
    // Commande inconnue de nous : on n'encaisse pas. Un identifiant PayPal
    // valide mais absent de nos registres signifie qu'on ne saurait ni quoi
    // expédier ni à quel prix.
    console.error("Capture refusée : commande inconnue", orderID);
    return Response.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (detail.traite) {
    return Response.json({ ok: true, deja: true, reference: detail.reference });
  }

  const capture = await capturerCommande(orderID);
  if (!capture.ok) {
    console.error("PayPal capture", capture.status, capture.error);
    return Response.json({ error: "Le paiement n'a pas pu être finalisé." }, { status: 502 });
  }

  const unit = capture.data.purchase_units?.[0];
  const adr = unit?.shipping?.address;
  const payeur = capture.data.payer;
  const nom =
    unit?.shipping?.name?.full_name ||
    [payeur?.name?.given_name, payeur?.name?.surname].filter(Boolean).join(" ");

  const commande: CommandePayee = {
    reference: detail.reference,
    source: "paypal",
    reel: paypalEnv() === "live",
    moyenPaiement: `PayPal — paiement en 4 fois${paypalEnv() === "live" ? "" : " (BAC À SABLE)"}`,
    client: { nom, email: payeur?.email_address ?? "", telephone: "" },
    adresse: adr
      ? {
          line1: adr.address_line_1 ?? "",
          line2: adr.address_line_2 ?? "",
          ville: adr.admin_area_2 ?? "",
          codePostal: adr.postal_code ?? "",
          pays: adr.country_code ?? "FR",
        }
      : null,
    livraison: detail.livraison,
    articles: detail.articles,
    totalCents: detail.totalCents,
    lienDetail:
      paypalEnv() === "live"
        ? `https://www.paypal.com/activity/payment/${orderID}`
        : `https://www.sandbox.paypal.com/activity/payment/${orderID}`,
  };

  // Marqué AVANT le traitement : si l'envoi d'un e-mail échoue, on préfère un
  // marchand qui relance à la main qu'une commande expédiée deux fois.
  try {
    await store.setJSON(orderID, { ...detail, traite: true, captureLe: new Date().toISOString() });
  } catch (err) {
    console.error("Blobs : marquage impossible", err);
  }

  try {
    await traiterCommande(commande);
  } catch (err) {
    // Le client a payé : on ne lui renvoie pas une erreur. Le marchand est
    // prévenu par les traces, et la commande reste visible côté PayPal.
    console.error("Traitement de la commande PayPal en échec", err);
  }

  return Response.json({ ok: true, reference: detail.reference });
};

export const config: Config = {
  path: "/api/paypal/capture-order",
};
