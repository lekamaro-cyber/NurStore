import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { CATALOG, LIVRAISONS, estModeLivraison, quantiteValide } from "../lib/catalogue.mts";
import { creerCommande, paypalConfigured } from "../lib/paypal.mts";
import { STOCK_TOTAL, getSold } from "../lib/stock.mts";

/**
 * Crée une commande PayPal pour le paiement en 4 fois.
 *
 * Le navigateur n'envoie que des identifiants de produit, des quantités et un
 * mode de livraison : les prix viennent du catalogue serveur. Le total est donc
 * calculé ici, pas reçu.
 *
 * Le détail de la commande est rangé dans Netlify Blobs sous l'identifiant
 * PayPal. La capture le relira plutôt que de refaire confiance au navigateur :
 * entre la création et l'encaissement, rien de ce qui vient du client n'est
 * réutilisé pour décider d'un montant ou d'un contenu de colis.
 */
export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!paypalConfigured()) {
    return Response.json(
      { error: "Le paiement en plusieurs fois n'est pas encore activé." },
      { status: 503 }
    );
  }

  let body: { items?: { id: string; quantity: number }[]; livraison?: string; promo?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  // Non-cumul avec l'offre de lancement. L'affichage masque déjà le fractionné
  // quand un code est saisi ; ce refus-ci est la règle, l'affichage n'en est que
  // la politesse.
  if (String(body.promo ?? "").trim()) {
    return Response.json(
      { error: "Le code promo n'est pas cumulable avec le paiement en plusieurs fois." },
      { status: 400 }
    );
  }

  const items = body.items ?? [];
  if (!items.length) return Response.json({ error: "Panier vide." }, { status: 400 });

  if (!estModeLivraison(body.livraison)) {
    return Response.json({ error: "Mode de livraison invalide." }, { status: 400 });
  }
  const livraison = LIVRAISONS[body.livraison];

  const articles: { nom: string; quantite: number; prixUnitaireCents: number }[] = [];
  let tabletQty = 0;
  for (const item of items) {
    const produit = CATALOG[item.id];
    if (!produit) return Response.json({ error: `Produit inconnu : ${item.id}` }, { status: 400 });
    const qte = quantiteValide(item.quantity);
    if (item.id === "nur-tablet") tabletQty += qte;
    articles.push({ nom: produit.name, quantite: qte, prixUnitaireCents: produit.price });
  }

  // Contrôle du stock, comme à la création de session Stripe.
  if (tabletQty > 0) {
    try {
      const restant = STOCK_TOTAL - (await getSold());
      if (restant <= 0) {
        return Response.json(
          { error: "Rupture de stock — la première série est épuisée." },
          { status: 409 }
        );
      }
      if (tabletQty > restant) {
        return Response.json(
          { error: `Il ne reste que ${restant} exemplaire${restant > 1 ? "s" : ""} disponible${restant > 1 ? "s" : ""}.` },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("Lecture du stock impossible", err);
      // On laisse passer plutôt que de bloquer la vente sur une erreur technique.
    }
  }

  const reference = `nur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const creation = await creerCommande({
    articles,
    livraisonCents: livraison.montant,
    livraisonLibelle: livraison.libelle,
    reference,
  });

  if (!creation.ok) {
    console.error("PayPal création commande", creation.status, creation.error);
    return Response.json({ error: "Impossible de créer la commande PayPal." }, { status: 502 });
  }

  const totalCents =
    articles.reduce((s, a) => s + a.prixUnitaireCents * a.quantite, 0) + livraison.montant;

  try {
    await getStore("nur-paypal-orders").setJSON(creation.data.id, {
      reference,
      articles: articles.map((a) => ({
        nom: a.nom,
        quantite: a.quantite,
        totalCents: a.prixUnitaireCents * a.quantite,
      })),
      livraison: {
        libelle: livraison.libelle,
        montantCents: livraison.montant,
        pointRelais: livraison.pointRelais,
      },
      totalCents,
      traite: false,
      creeLe: new Date().toISOString(),
    });
  } catch (err) {
    // Sans ce détail, la capture ne saurait ni quoi expédier ni combien
    // décompter. Mieux vaut refuser maintenant que d'encaisser à l'aveugle.
    console.error("Blobs : enregistrement de la commande impossible", err);
    return Response.json({ error: "Impossible de préparer la commande." }, { status: 502 });
  }

  return Response.json({ id: creation.data.id });
};

export const config: Config = {
  path: "/api/paypal/create-order",
};
