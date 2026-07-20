import Stripe from "stripe";
import type { Config } from "@netlify/functions";
import { STOCK_TOTAL, addSold } from "../lib/stock.mts";
import { announceOrder, sendcloudConfigured } from "../lib/sendcloud.mts";

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

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key || !to) {
    console.error("RESEND_API_KEY ou destinataire manquant");
    return false;
  }
  // RESEND_FROM (ex. "NUR Store <commandes@nur-store.com>") exige un domaine
  // vérifié chez Resend. Sans lui, expéditeur par défaut (envois au marchand only).
  const from = Netlify.env.get("RESEND_FROM") || "NUR Store <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: "contact@nur-store.com",
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

  // Met à jour le compteur de stock (tablettes uniquement).
  const tabletQty = lineItems.data
    .filter((li) => (li.description || "").includes("Tablette NUR"))
    .reduce((n, li) => n + (li.quantity ?? 0), 0);
  let stockLine = "";
  if (tabletQty > 0) {
    try {
      const sold = await addSold(tabletQty);
      stockLine = `STOCK : ${Math.max(0, STOCK_TOTAL - sold)} tablette(s) restante(s) sur ${STOCK_TOTAL}`;
    } catch (err) {
      console.error("Mise à jour du stock impossible", err);
      stockLine = "STOCK : mise à jour impossible, vérifier manuellement.";
    }
  }

  // Annonce la commande dans Sendcloud (adresse pré-remplie, étiquette en 2 clics).
  let sendcloudLine = "";
  if (sendcloudConfigured()) {
    const addr = s?.address ?? c?.address;
    const announced = addr
      ? await announceOrder({
          sessionId: session.id,
          name: s?.name ?? c?.name ?? "",
          email: c?.email ?? "",
          phone: c?.phone ?? "",
          line1: addr.line1 ?? "",
          line2: addr.line2 ?? "",
          city: addr.city ?? "",
          postalCode: addr.postal_code ?? "",
          country: addr.country ?? "FR",
          orderValueCents: session.amount_total ?? 0,
          shippingMethod: shippingName,
          items: lineItems.data.map((li) => ({
            name: li.description ?? "Article",
            quantity: li.quantity ?? 1,
            totalCents: li.amount_total ?? 0,
          })),
        })
      : { ok: false, error: "adresse de livraison absente" };
    sendcloudLine = announced.ok
      ? `SENDCLOUD : commande importée ✓ — Expédition → Commandes, adresse déjà remplie.`
      : `SENDCLOUD : import impossible — créer l'envoi à la main depuis cet e-mail.\n  Détail : ${announced.error ?? "inconnu"}`;
  }

  const text = [
    `NOUVELLE COMMANDE NUR 🎉`,
    ``,
    `ARTICLES`,
    items,
    ``,
    `Livraison : ${shippingName} — ${euro(session.shipping_cost?.amount_total)}`,
    session.metadata?.promo ? `CODE PROMO : ${session.metadata.promo} (housse + livraison offertes)` : ``,
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
    stockLine,
    sendcloudLine,
    ``,
    `Référence Stripe : ${session.id}`,
    `Détail : https://dashboard.stripe.com/payments/${session.payment_intent}`,
  ].join("\n");

  const merchantEmail = Netlify.env.get("ORDER_NOTIFY_EMAIL") ?? "";
  await sendEmail(merchantEmail, `🛒 Commande NUR — ${euro(session.amount_total)} — ${c?.name ?? c?.email ?? ""}`, text);

  // Confirmation au client — uniquement si RESEND_FROM est configuré
  // (domaine vérifié chez Resend), sinon Resend refuserait l'envoi.
  if (Netlify.env.get("RESEND_FROM") && c?.email) {
    const firstName = (s?.name ?? c?.name ?? "").split(" ")[0];
    const clientText = [
      `${firstName ? firstName + ", m" : "M"}erci pour votre commande ! 🌙`,
      ``,
      `Nous préparons votre colis avec soin — expédition sous 48 h ouvrées.`,
      `Vous recevrez le numéro de suivi dès l'envoi.`,
      ``,
      `VOTRE COMMANDE`,
      items,
      `  Livraison : ${shippingName} — ${euro(session.shipping_cost?.amount_total)}`,
      `  Total payé : ${euro(session.amount_total)}`,
      ``,
      isRelay
        ? `📍 Livraison en point relais : si ce n'est pas déjà fait, indiquez votre relais sur la page de confirmation, ou répondez simplement à cet e-mail.`
        : `📦 Livraison à domicile à l'adresse indiquée lors du paiement.`,
      ``,
      `Une question ? Répondez à cet e-mail ou écrivez-nous : contact@nur-store.com`,
      ``,
      `Qu'Allah vous récompense pour votre confiance.`,
      `L'équipe NUR — nur-store.com`,
    ].join("\n");
    await sendEmail(c.email, `Votre commande NUR est confirmée ✓`, clientText);
  }

  return Response.json({ received: true });
};

export const config: Config = {
  path: "/api/stripe-webhook",
};
