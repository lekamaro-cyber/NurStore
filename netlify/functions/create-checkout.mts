import Stripe from "stripe";
import type { Context, Config } from "@netlify/functions";
import { STOCK_TOTAL, getSold } from "../lib/stock.mts";

/**
 * Catalogue AUTORITATIF — les prix sont fixés ICI, côté serveur, en centimes (EUR).
 * On ne fait JAMAIS confiance au prix envoyé par le navigateur.
 * Pour changer le prix : modifie la valeur ci-dessous (et aussi public/products.json
 * pour l'affichage). 29900 = 299,00 €.
 */
const CATALOG: Record<string, { name: string; price: number }> = {
  "nur-tablet": { name: "Tablette NUR — Coran, prière & hadith", price: 19900 },
  "nur-housse": { name: "Housse de protection Nur", price: 1000 },
  // Produit de validation interne (1 €) — absent du site, accessible via
  // la page cachée /commande-test.html. N'entame pas le stock.
  "nur-test": { name: "Commande de validation NUR (interne)", price: 100 },
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

  let body: { items?: { id: string; quantity: number }[]; promo?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const items = body.items ?? [];
  if (!items.length) {
    return Response.json({ error: "Panier vide." }, { status: 400 });
  }

  // Nombre de tablettes demandées (sert au code promo et au contrôle du stock).
  const tabletQty = items
    .filter((i) => i.id === "nur-tablet")
    .reduce((n, i) => n + Math.max(1, Math.min(10, Math.floor(Number(i.quantity) || 1))), 0);

  // Code promo de lancement (défini via la variable d'environnement PROMO_CODE) :
  // housse offerte + livraison offerte — UNIQUEMENT avec une tablette au panier.
  const promoInput = String(body.promo ?? "").trim().toUpperCase();
  const promoCode = (Netlify.env.get("PROMO_CODE") ?? "").trim().toUpperCase();
  const promoValid = promoCode !== "" && promoInput === promoCode && tabletQty > 0;
  if (promoInput && promoCode !== "" && promoInput === promoCode && tabletQty === 0) {
    return Response.json(
      { error: "Le code promo s'applique uniquement avec une tablette NUR dans le panier." },
      { status: 400 }
    );
  }
  if (promoInput && promoInput !== promoCode) {
    return Response.json({ error: "Code promo invalide." }, { status: 400 });
  }

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const item of items) {
    const product = CATALOG[item.id];
    if (!product) {
      return Response.json({ error: `Produit inconnu : ${item.id}` }, { status: 400 });
    }
    const qty = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)));
    const housseOfferte = promoValid && item.id === "nur-housse";
    line_items.push({
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: housseOfferte ? 0 : product.price,
        product_data: { name: housseOfferte ? `${product.name} (offerte)` : product.name },
      },
    });
  }

  // Contrôle du stock de tablettes (première série limitée).
  if (tabletQty > 0) {
    try {
      const sold = await getSold();
      const remaining = STOCK_TOTAL - sold;
      if (remaining <= 0) {
        return Response.json(
          { error: "Rupture de stock — la première série est épuisée. Suivez-nous sur Instagram pour le réassort !" },
          { status: 409 }
        );
      }
      if (tabletQty > remaining) {
        return Response.json(
          { error: `Il ne reste que ${remaining} exemplaire${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""}.` },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("Lecture du stock impossible", err);
      // On laisse passer plutôt que de bloquer la vente sur une erreur technique.
    }
  }

  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") || new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "fr",
      line_items,
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] },
      // Options de livraison proposées au client (montants en centimes).
      // Pour changer un prix : modifie amount ci-dessous. 500 = 5,00 €.
      // Avec le code promo de lancement, la livraison est offerte.
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: promoValid ? 0 : 500, currency: CURRENCY },
            display_name: promoValid ? "Mondial Relay — Point relais (offert)" : "Mondial Relay — Point relais",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 4 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: promoValid ? 0 : 800, currency: CURRENCY },
            display_name: promoValid ? "Colissimo — Livraison à domicile (offerte)" : "Colissimo — Livraison à domicile",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 3 },
            },
          },
        },
      ],
      metadata: { promo: promoValid ? promoCode : "" },
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
