import Stripe from "stripe";
import type { Context, Config } from "@netlify/functions";

/**
 * Catalogue AUTORITATIF — les prix sont fixés ICI, côté serveur, en centimes (EUR).
 * On ne fait JAMAIS confiance au prix envoyé par le navigateur.
 * Pour changer le prix : modifie la valeur ci-dessous (et aussi public/products.json
 * pour l'affichage). 29900 = 299,00 €.
 */
const CATALOG: Record<string, { name: string; price: number }> = {
  "nur-tablet": { name: "Afficheur Nur — Horaires de prière", price: 19900 },
  "nur-housse": { name: "Housse de protection Nur", price: 1000 },
};

const CURRENCY = "eur";
// Pays où la livraison est proposée au moment du paiement.
const SHIPPING_COUNTRIES = ["FR", "BE", "LU", "MC", "CH"] as const;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!secret) {
    // Tant que la clé Stripe n'est pas configurée, on renvoie un message clair
    // au lieu d'une erreur 500 incompréhensible.
    return Response.json(
      {
        error:
          "Le paiement n'est pas encore activé. Ajoute ta clé STRIPE_SECRET_KEY dans les variables d'environnement Netlify pour encaisser les commandes.",
      },
      { status: 503 }
    );
  }

  let body: { items?: { id: string; quantity: number }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const items = body.items ?? [];
  if (!items.length) {
    return Response.json({ error: "Panier vide." }, { status: 400 });
  }

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const item of items) {
    const product = CATALOG[item.id];
    if (!product) {
      return Response.json({ error: `Produit inconnu : ${item.id}` }, { status: 400 });
    }
    const qty = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)));
    line_items.push({
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: product.price,
        product_data: { name: product.name },
      },
    });
  }

  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") || new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items,
      shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error", err);
    return Response.json(
      { error: "Impossible de créer la session de paiement. Vérifie ta clé Stripe." },
      { status: 502 }
    );
  }
};

export const config: Config = {
  path: "/api/checkout",
};
