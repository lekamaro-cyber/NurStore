import type { Config } from "@netlify/functions";
import { STOCK_TOTAL, getSold } from "../lib/stock.mts";

/** Expose l'état du stock au site (affichage rupture / "plus que X"). */
export default async () => {
  try {
    const sold = await getSold();
    return Response.json({
      total: STOCK_TOTAL,
      remaining: Math.max(0, STOCK_TOTAL - sold),
    });
  } catch (err) {
    console.error("get-stock error", err);
    // En cas de pépin, on ne bloque pas la vente côté affichage :
    // le contrôle strict reste fait au moment du paiement.
    return Response.json({ total: STOCK_TOTAL, remaining: STOCK_TOTAL });
  }
};

export const config: Config = {
  path: "/api/stock",
};
