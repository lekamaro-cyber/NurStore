/**
 * Catalogue AUTORITATIF — les prix sont fixés ICI, côté serveur, en centimes (EUR).
 * On ne fait JAMAIS confiance au prix envoyé par le navigateur.
 *
 * Extrait de `create-checkout.mts` quand le parcours PayPal est arrivé : deux
 * fonctions de paiement qui calculent des totaux à partir de deux copies du
 * catalogue, c'est la garantie qu'un jour un prix sera corrigé d'un seul côté.
 *
 * Pour changer un prix : modifier la valeur ci-dessous ET `public/products.json`
 * pour l'affichage.
 */
export type Produit = { name: string; price: number };

export const CATALOG: Record<string, Produit> = {
  "nur-tablet": { name: "Tablette NUR — Coran, prière & hadith", price: 19900 },
  "nur-housse": { name: "Housse de protection Nur", price: 1000 },
  // Produits de validation internes — absents du site, accessibles via la page
  // cachée /commande-test.html. Leur nom ne contient pas « Tablette NUR », ils
  // n'entament donc pas le compteur de stock.
  //   · nur-test     : 1 €, pour éprouver le paiement comptant (Stripe).
  //   · nur-test-4x  : 51 €, pour éprouver le paiement en 4 fois — PayPal ne
  //     propose le fractionné qu'à partir de 20 €, un test à 1 € ne l'afficherait
  //     jamais.
  "nur-test": { name: "Commande de validation NUR (interne)", price: 100 },
  "nur-test-4x": { name: "Commande de validation NUR 4× (interne)", price: 5100 },
};

export const CURRENCY = "eur";

/** Pays où la livraison est proposée au moment du paiement. */
export const SHIPPING_COUNTRIES = ["FR", "BE", "LU", "MC", "CH"] as const;

/** Modes de livraison et tarifs, en centimes. */
export const LIVRAISONS = {
  relay: { libelle: "Mondial Relay — Point relais", montant: 500, pointRelais: true },
  home: { libelle: "Colissimo — Livraison à domicile", montant: 1000, pointRelais: false },
} as const;

export type ModeLivraison = keyof typeof LIVRAISONS;

export const estModeLivraison = (v: unknown): v is ModeLivraison =>
  typeof v === "string" && v in LIVRAISONS;

/** Quantité bornée, comme à la création de session Stripe. */
export const quantiteValide = (q: unknown) =>
  Math.max(1, Math.min(10, Math.floor(Number(q) || 1)));
