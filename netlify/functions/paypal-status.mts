import type { Config } from "@netlify/functions";
import { paypalConfigured, paypalEnv } from "../lib/paypal.mts";

/**
 * Dit au site si le paiement en plusieurs fois doit être proposé, et avec quel
 * identifiant public charger le SDK PayPal.
 *
 * Pourquoi ce verrou. En bac à sable, un bouton PayPal affiché sur le site
 * public serait un piège : le visiteur croirait payer, aucun argent ne
 * changerait de main, et la commande partirait quand même — stock décompté,
 * étiquette créée, e-mails envoyés. Le fractionné n'est donc proposé au public
 * que lorsque PAYPAL_ENV vaut « live ».
 *
 * Pour essayer le parcours en sandbox sans l'exposer, ajouter `?pp=test` à
 * l'URL : le site le demande alors explicitement, et c'est ce paramètre — pas
 * une variable d'environnement — qui lève le verrou.
 */
export default async (req: Request) => {
  const essai = new URL(req.url).searchParams.get("pp") === "test";
  const configure = paypalConfigured();
  const env = paypalEnv();

  return Response.json(
    {
      actif: configure && (env === "live" || essai),
      env,
      configure,
      // Identifiant public, destiné à figurer dans la page : c'est ainsi qu'il
      // est utilisé par tous les sites qui intègrent PayPal.
      clientId: configure ? Netlify.env.get("PAYPAL_CLIENT_ID") : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
};

export const config: Config = {
  path: "/api/paypal/status",
};
