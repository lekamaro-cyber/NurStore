import type { Config } from "@netlify/functions";
import { STOCK_TOTAL, getSold } from "../lib/stock.mts";

/** Expose l'état du stock au site (affichage rupture / "plus que X"). */
export default async () => {
  // Offre publique : si PROMO_PUBLIC vaut "1", le site affiche le code promo
  // (bandeau + bloc achat + champ pré-rempli). Supprimer la variable pour
  // arrêter l'affichage ; supprimer PROMO_CODE pour désactiver le code.
  const promo =
    (Netlify.env.get("PROMO_PUBLIC") ?? "") === "1"
      ? (Netlify.env.get("PROMO_CODE") ?? "").trim().toUpperCase() || null
      : null;
  try {
    const sold = await getSold();
    return Response.json({
      total: STOCK_TOTAL,
      remaining: Math.max(0, STOCK_TOTAL - sold),
      promo,
    });
  } catch (err) {
    console.error("get-stock error", err);
    // En cas de pépin, on ne bloque pas la vente côté affichage :
    // le contrôle strict reste fait au moment du paiement.
    return Response.json({ total: STOCK_TOTAL, remaining: STOCK_TOTAL, promo });
  }
};

export const config: Config = {
  path: "/api/stock",
};
