import Stripe from "stripe";
import type { Config } from "@netlify/functions";
import { traiterCommande, type CommandePayee } from "../lib/fulfilment.mts";

/**
 * Webhook Stripe : à chaque paiement réussi (checkout.session.completed),
 * traduit la session en commande normalisée et la confie à `traiterCommande`
 * — décompte du stock, import Sendcloud, e-mail marchand, e-mail client.
 *
 * Cette chaîne était écrite ici ; elle a été extraite dans `lib/fulfilment.mts`
 * quand le paiement en 4 fois par PayPal est arrivé, pour que les deux moyens
 * de paiement produisent exactement les mêmes effets. Ce fichier ne garde que
 * ce qui est propre à Stripe : vérifier la signature, relire la session, et
 * traduire son vocabulaire dans le nôtre.
 *
 * Variables d'environnement requises (Netlify) :
 *  - STRIPE_SECRET_KEY      : clé secrète Stripe
 *  - STRIPE_WEBHOOK_SECRET  : secret de signature du webhook (whsec_...)
 *  - RESEND_API_KEY         : clé API Resend (envoi d'e-mails)
 *  - ORDER_NOTIFY_EMAIL     : l'adresse qui reçoit les commandes
 */
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
    stripe.checkout.sessions.retrieve(sessionId, { expand: ["shipping_cost.shipping_rate"] }),
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
  const addr = s?.address ?? c?.address;

  const commande: CommandePayee = {
    reference: session.id,
    source: "stripe",
    moyenPaiement: "Stripe — paiement comptant",
    client: {
      nom: s?.name ?? c?.name ?? "",
      email: c?.email ?? "",
      telephone: c?.phone ?? "",
    },
    adresse: addr
      ? {
          line1: addr.line1 ?? "",
          line2: addr.line2 ?? "",
          ville: addr.city ?? "",
          codePostal: addr.postal_code ?? "",
          pays: addr.country ?? "FR",
        }
      : null,
    livraison: {
      libelle: shippingName || "Non précisé",
      montantCents: session.shipping_cost?.amount_total ?? 0,
      pointRelais: (shippingName || "").toLowerCase().includes("relay"),
    },
    articles: lineItems.data.map((li) => ({
      nom: li.description ?? "Article",
      quantite: li.quantity ?? 1,
      totalCents: li.amount_total ?? 0,
    })),
    totalCents: session.amount_total ?? 0,
    promo: session.metadata?.promo || undefined,
    lienDetail: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
  };

  await traiterCommande(commande);

  return Response.json({ received: true });
};

export const config: Config = {
  path: "/api/stripe-webhook",
};
