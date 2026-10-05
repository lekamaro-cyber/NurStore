/**
 * Client minimal de l'API Orders v2 de PayPal.
 *
 * Sert au paiement en 4 fois, que Stripe ne propose pas : son catalogue BNPL
 * contient Affirm, Afterpay, Zip et Klarna, pas le fractionné de PayPal. Il faut
 * donc un second parcours de paiement, intégré directement chez PayPal, qui
 * rejoint ensuite la même chaîne de traitement que les commandes Stripe
 * (cf. `fulfilment.mts`).
 *
 * Variables d'environnement (Netlify) :
 *  - PAYPAL_CLIENT_ID      : identifiant public de l'application
 *  - PAYPAL_CLIENT_SECRET  : secret — ne doit JAMAIS atteindre le navigateur
 *  - PAYPAL_ENV            : "sandbox" (défaut) ou "live"
 *
 * Le choix bac à sable / production se fait par PAYPAL_ENV et non par le préfixe
 * de la clé comme chez Stripe : PayPal n'en met pas. Défaut volontairement en
 * sandbox — une erreur de configuration doit donner une commande de test, pas un
 * débit réel.
 */

const API = () =>
  (Netlify.env.get("PAYPAL_ENV") ?? "sandbox") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export const paypalConfigured = () =>
  !!Netlify.env.get("PAYPAL_CLIENT_ID") && !!Netlify.env.get("PAYPAL_CLIENT_SECRET");

export const paypalEnv = () => (Netlify.env.get("PAYPAL_ENV") ?? "sandbox");

export type PayPalError = { ok: false; status: number; error: string };
export type PayPalOk<T> = { ok: true; data: T };
export type PayPalResult<T> = PayPalOk<T> | PayPalError;

/**
 * Jeton d'accès OAuth2. PayPal les donne pour ~9 heures, mais une fonction
 * Netlify ne vit que le temps d'une requête : on ne met rien en cache, le coût
 * d'un aller-retour est négligeable devant la complexité d'un cache partagé
 * entre invocations.
 */
async function accessToken(): Promise<PayPalResult<string>> {
  const id = Netlify.env.get("PAYPAL_CLIENT_ID") ?? "";
  const secret = Netlify.env.get("PAYPAL_CLIENT_SECRET") ?? "";
  if (!id || !secret) {
    return { ok: false, status: 503, error: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET absents" };
  }
  const res = await fetch(`${API()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    return { ok: false, status: res.status, error: body.error_description ?? "jeton refusé" };
  }
  return { ok: true, data: body.access_token as string };
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<PayPalResult<T>> {
  const token = await accessToken();
  if (!token.ok) return token;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.data}`,
    "Content-Type": "application/json",
  };
  // PayPal rejoue la réponse d'origine au lieu de créer un doublon. Indispensable
  // sur la capture : un clic nerveux ou un réessai réseau ne doit pas débiter
  // deux fois.
  if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;

  const res = await fetch(`${API()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.details?.[0]?.description ?? json?.message ?? `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: detail };
  }
  return { ok: true, data: json as T };
}

export type MontantLigne = { nom: string; quantite: number; prixUnitaireCents: number };

export type CreationCommande = {
  articles: MontantLigne[];
  livraisonCents: number;
  livraisonLibelle: string;
  /** Référence interne, reprise ensuite dans les e-mails et chez Sendcloud. */
  reference: string;
};

const euros = (cents: number) => (cents / 100).toFixed(2);

/**
 * Crée la commande chez PayPal.
 *
 * Le détail (`breakdown`) est fourni article par article plutôt qu'en un seul
 * montant : c'est ce que le client voit sur la page PayPal, et c'est aussi ce
 * qui permet à PayPal de vérifier que la somme tombe juste. Un écart d'un
 * centime entre le total et la somme des lignes fait échouer la création, ce qui
 * est une bonne chose — mieux vaut une erreur ici qu'un montant faux débité.
 */
export async function creerCommande(c: CreationCommande) {
  const articlesCents = c.articles.reduce((s, a) => s + a.prixUnitaireCents * a.quantite, 0);
  const totalCents = articlesCents + c.livraisonCents;

  return call<{ id: string; status: string }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: c.reference,
          description: "Commande NUR",
          amount: {
            currency_code: "EUR",
            value: euros(totalCents),
            breakdown: {
              item_total: { currency_code: "EUR", value: euros(articlesCents) },
              shipping: { currency_code: "EUR", value: euros(c.livraisonCents) },
            },
          },
          items: c.articles.map((a) => ({
            name: a.nom.slice(0, 127),
            quantity: String(a.quantite),
            unit_amount: { currency_code: "EUR", value: euros(a.prixUnitaireCents) },
            category: "PHYSICAL_GOODS",
          })),
          shipping: { type: "SHIPPING" },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "NUR",
            locale: "fr-FR",
            shipping_preference: "GET_FROM_FILE",
            user_action: "PAY_NOW",
          },
        },
      },
    },
    c.reference
  );
}

export type CaptureResult = {
  id: string;
  status: string;
  payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
  purchase_units?: Array<{
    reference_id?: string;
    shipping?: {
      name?: { full_name?: string };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_1?: string;
        admin_area_2?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
    payments?: { captures?: Array<{ id: string; amount?: { value?: string } }> };
  }>;
};

/** Encaisse une commande approuvée par l'acheteur. */
export async function capturerCommande(orderId: string) {
  return call<CaptureResult>("POST", `/v2/checkout/orders/${orderId}/capture`, {}, `capture-${orderId}`);
}

/** Relit une commande — sert à vérifier l'état sans la capturer. */
export async function lireCommande(orderId: string) {
  return call<CaptureResult>("GET", `/v2/checkout/orders/${orderId}`);
}
