import Stripe from "stripe";
import type { Config } from "@netlify/functions";

/**
 * Webhook Stripe : à chaque paiement réussi (checkout.session.completed),
 * envoie un e-mail récapitulatif COMPLET de la commande au marchand.
 *
 * Variables d'environnement requises (Netlify) :
 *  - STRIPE_SECRET_KEY      : clé secrète Stripe
 *  - STRIPE_WEBHOOK_SECRET  : secret de signature du webhook (whsec_...)
 *  - RESEND_API_KEY         : clé API Resend (envoi d'e-mails)
 *  - ORDER_NOTIFY_EMAIL     : l'adresse qui reçoit les commandes
 */

const euro = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toFixed(2).replace(".", ",") + " €";

async function sendEmail(subject: string, text: string): Promise<boolean> {
  const key = Netlify.env.get("RESEND_API_KEY");
  const to = Netlify.env.get("ORDER_NOTIFY_EMAIL");
  if (!key || !to) {
    console.error("RESEND_API_KEY ou ORDER_NOTIFY_EMAIL manquant");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "NUR Store <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

export default async (req: Request) => {
  const secret = Netlify.env.get("STRIPE_SECRET_KEY");
  const whSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret || !whSecret) return new Response("Webhook non configuré", { status: 503 });

  const stripe = new Stripe(secret);
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature!, whSecret);
  } catch (err) {
    console.error("Signature webhook invalide", err);
    return new Response("Signature invalide", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const sessionId = (event.data.object as Stripe.Checkout.Session).id;

  // Récupère le détail complet : articles, livraison, client.
  const [session, lineItems] = await Promise.all([
    stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["shipping_cost.shipping_rate"],
    }),
    stripe.checkout.sessions.listLineItems(sessionId, { limit: 20 }),
  ]);

  const c = session.customer_details;
  // L'adresse de livraison peut être exposée différemment selon la version d'API.
  const s: any =
    (session as any).collected_information?.shipping_details ??
    (session as any).shipping_details ??
    null;
  const rate = session.shipping_cost?.shipping_rate;
  const shippingName = typeof rate === "object" && rate ? rate.display_name : "Non précisé";
  const isRelay = (shippingName || "").toLowerCase().includes("relay");

  const fmtAddr = (a: any) =>
    a
      ? [a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`.trim(), a.country]
          .filter(Boolean)
          .join("\n  ")
      : "—";

  const items = lineItems.data
    .map((li) => `  • ${li.quantity} × ${li.description} — ${euro(li.amount_total)}`)
    .join("\n");

  const text = [
    `NOUVELLE COMMANDE NUR 🎉`,
    ``,
    `ARTICLES`,
    items,
    ``,
    `Livraison : ${shippingName} — ${euro(session.shipping_cost?.amount_total)}`,
    `TOTAL PAYÉ : ${euro(session.amount_total)}`,
    ``,
    `CLIENT`,
    `  Nom    : ${s?.name ?? c?.name ?? "—"}`,
    `  Email  : ${c?.email ?? "—"}`,
    `  Tél    : ${c?.phone ?? "—"}`,
    ``,
    `ADRESSE DE LIVRAISON`,
    `  ${fmtAddr(s?.address ?? c?.address)}`,
    ``,
    isRelay
      ? `⚠️ POINT RELAIS : le client choisit son relais sur la page de confirmation — un second e-mail arrivera avec son choix. S'il ne vient pas, relancez le client.`
      : `Livraison à domicile : l'adresse ci-dessus suffit pour l'étiquette.`,
    ``,
    `Référence Stripe : ${session.id}`,
    `Détail : https://dashboard.stripe.com/payments/${session.payment_intent}`,
  ].join("\n");

  await sendEmail(`🛒 Commande NUR — ${euro(session.amount_total)} — ${c?.name ?? c?.email ?? ""}`, text);

  return Response.json({ received: true });
};

export const config: Config = {
  path: "/api/stripe-webhook",
};
