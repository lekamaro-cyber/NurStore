import Stripe from "stripe";
import type { Config } from "@netlify/functions";

/**
 * Renvoie le mode de livraison choisi pour une session Checkout terminée.
 * Utilisé par success.html pour proposer le choix du point relais
 * quand le client a payé une livraison Mondial Relay.
 */
export default async (req: Request) => {
  const secret = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!secret) {
    return Response.json({ error: "Stripe non configuré." }, { status: 503 });
  }

  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return Response.json({ error: "session_id invalide." }, { status: 400 });
  }

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["shipping_cost.shipping_rate"],
    });
    const rate = session.shipping_cost?.shipping_rate;
    const shipping = typeof rate === "object" && rate ? rate.display_name : null;
    // Adresse de livraison (l'exposition varie selon la version d'API Stripe).
    const shippingDetails: any =
      (session as any).collected_information?.shipping_details ??
      (session as any).shipping_details ??
      null;
    const addr = shippingDetails?.address ?? session.customer_details?.address ?? null;
    return Response.json({
      shipping,
      email: session.customer_details?.email ?? null,
      postal_code: addr?.postal_code ?? null,
      country: addr?.country ?? "FR",
    });
  } catch (err) {
    console.error("get-session error", err);
    return Response.json({ error: "Session introuvable." }, { status: 404 });
  }
};

export const config: Config = {
  path: "/api/session",
};
