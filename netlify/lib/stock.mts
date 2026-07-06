import { getStore } from "@netlify/blobs";

/**
 * Compteur de stock de la tablette NUR (première série).
 * - Le total est modifiable sans toucher au code via la variable
 *   d'environnement STOCK_TOTAL (défaut : 38).
 * - Le compteur "vendu" est séparé entre mode test et mode live
 *   (déduit du préfixe de la clé Stripe), donc les tests ne
 *   consomment pas le stock réel.
 */

export const STOCK_TOTAL = Number(Netlify.env.get("STOCK_TOTAL") ?? "38");

// Clé standard (sk_live_) ou restreinte (rk_live_) : les deux comptent comme "live".
const counterKey = () =>
  /^(sk|rk)_live/.test(Netlify.env.get("STRIPE_SECRET_KEY") ?? "")
    ? "sold_live"
    : "sold_test";

export async function getSold(): Promise<number> {
  const store = getStore("nur-stock");
  const value = await store.get(counterKey());
  return value ? parseInt(value, 10) || 0 : 0;
}

export async function addSold(qty: number): Promise<number> {
  const store = getStore("nur-stock");
  const total = (await getSold()) + qty;
  await store.set(counterKey(), String(total));
  return total;
}
