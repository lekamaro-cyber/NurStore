/**
 * Ce qui se passe APRÈS un paiement réussi, quel qu'en soit le moyen.
 *
 * Cette chaîne vivait à l'intérieur du webhook Stripe. Le paiement en 4 fois
 * passe par PayPal et doit produire exactement les mêmes effets — décompte du
 * stock, import Sendcloud, e-mail marchand, e-mail client. La dupliquer aurait
 * garanti qu'elle dérive : une correction appliquée d'un côté et pas de l'autre,
 * et des commandes traitées différemment selon le bouton cliqué.
 *
 * D'où cette extraction. Les deux parcours construisent une `CommandePayee`,
 * normalisée, et appellent `traiterCommande`. Tout ce qui est propre à Stripe
 * ou à PayPal reste dans leur fonction respective.
 */
import { STOCK_TOTAL, addSold } from "./stock.mts";
import { announceOrder, sendcloudConfigured } from "./sendcloud.mts";

export const euro = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toFixed(2).replace(".", ",") + " €";

export type ArticleCommande = { nom: string; quantite: number; totalCents: number };

export type CommandePayee = {
  /** Référence du paiement, reprise dans les e-mails et chez Sendcloud. */
  reference: string;
  source: "stripe" | "paypal";
  /** Mention affichée au marchand, ex. « PayPal — paiement en 4 fois ». */
  moyenPaiement: string;
  client: { nom: string; email: string; telephone: string };
  adresse: {
    line1: string;
    line2: string;
    ville: string;
    codePostal: string;
    pays: string;
  } | null;
  livraison: { libelle: string; montantCents: number; pointRelais: boolean };
  articles: ArticleCommande[];
  totalCents: number;
  promo?: string;
  /** Lien vers le détail côté prestataire, pour l'e-mail marchand. */
  lienDetail?: string;
};

async function envoyerEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key || !to) {
    console.error("RESEND_API_KEY ou destinataire manquant");
    return false;
  }
  // RESEND_FROM (ex. "NUR Store <commandes@nur-store.com>") exige un domaine
  // vérifié chez Resend. Sans lui, expéditeur par défaut (envois au marchand only).
  const from = Netlify.env.get("RESEND_FROM") || "NUR Store <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: "contact@nur-store.com", subject, text }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

const formaterAdresse = (a: CommandePayee["adresse"]) =>
  a
    ? [a.line1, a.line2, `${a.codePostal} ${a.ville}`.trim(), a.pays].filter(Boolean).join("\n  ")
    : "—";

/**
 * Décompte du stock. Ne compte que les tablettes : la housse et le produit de
 * validation interne n'entament pas la série.
 */
async function majStock(articles: ArticleCommande[]): Promise<string> {
  const qte = articles
    .filter((a) => a.nom.includes("Tablette NUR"))
    .reduce((n, a) => n + a.quantite, 0);
  if (qte <= 0) return "";
  try {
    const sold = await addSold(qte);
    return `STOCK : ${Math.max(0, STOCK_TOTAL - sold)} tablette(s) restante(s) sur ${STOCK_TOTAL}`;
  } catch (err) {
    console.error("Mise à jour du stock impossible", err);
    return "STOCK : mise à jour impossible, vérifier manuellement.";
  }
}

async function annoncerSendcloud(c: CommandePayee): Promise<string> {
  if (!sendcloudConfigured()) return "";
  if (!c.adresse) return "SENDCLOUD : import impossible — adresse de livraison absente.";
  const r = await announceOrder({
    sessionId: c.reference,
    name: c.client.nom,
    email: c.client.email,
    phone: c.client.telephone,
    line1: c.adresse.line1,
    line2: c.adresse.line2,
    city: c.adresse.ville,
    postalCode: c.adresse.codePostal,
    country: c.adresse.pays || "FR",
    orderValueCents: c.totalCents,
    shippingMethod: c.livraison.libelle,
    items: c.articles.map((a) => ({ name: a.nom, quantity: a.quantite, totalCents: a.totalCents })),
  });
  return r.ok
    ? "SENDCLOUD : commande importée ✓ — Expédition → Commandes, adresse déjà remplie."
    : `SENDCLOUD : import impossible — créer l'envoi à la main depuis cet e-mail.\n  Détail : ${r.error ?? "inconnu"}`;
}

/**
 * Exécute toute la chaîne. Les erreurs d'une étape n'empêchent pas les
 * suivantes : une panne Sendcloud ne doit pas priver le marchand de son e-mail
 * de commande, puisque c'est ce qui lui permet de la traiter à la main.
 */
export async function traiterCommande(c: CommandePayee): Promise<void> {
  const lignes = c.articles
    .map((a) => `  • ${a.quantite} × ${a.nom} — ${euro(a.totalCents)}`)
    .join("\n");

  const [ligneStock, ligneSendcloud] = await Promise.all([
    majStock(c.articles),
    annoncerSendcloud(c),
  ]);

  const texte = [
    `NOUVELLE COMMANDE NUR 🎉`,
    ``,
    `ARTICLES`,
    lignes,
    ``,
    `Livraison : ${c.livraison.libelle} — ${euro(c.livraison.montantCents)}`,
    c.promo ? `CODE PROMO : ${c.promo} (housse + livraison offertes)` : ``,
    `TOTAL PAYÉ : ${euro(c.totalCents)}`,
    `PAIEMENT : ${c.moyenPaiement}`,
    ``,
    `CLIENT`,
    `  Nom    : ${c.client.nom || "—"}`,
    `  Email  : ${c.client.email || "—"}`,
    `  Tél    : ${c.client.telephone || "—"}`,
    ``,
    `ADRESSE DE LIVRAISON`,
    `  ${formaterAdresse(c.adresse)}`,
    ``,
    c.livraison.pointRelais
      ? `⚠️ POINT RELAIS : le client choisit son relais sur la page de confirmation — un second e-mail arrivera avec son choix. S'il ne vient pas, relancez le client.`
      : `Livraison à domicile : l'adresse ci-dessus suffit pour l'étiquette.`,
    ``,
    ligneStock,
    ligneSendcloud,
    ``,
    `Référence : ${c.reference}`,
    c.lienDetail ? `Détail : ${c.lienDetail}` : ``,
  ].join("\n");

  await envoyerEmail(
    Netlify.env.get("ORDER_NOTIFY_EMAIL") ?? "",
    `🛒 Commande NUR — ${euro(c.totalCents)} — ${c.client.nom || c.client.email}`,
    texte
  );

  // Confirmation au client — uniquement si RESEND_FROM est configuré
  // (domaine vérifié chez Resend), sinon Resend refuserait l'envoi.
  if (Netlify.env.get("RESEND_FROM") && c.client.email) {
    const prenom = (c.client.nom || "").split(" ")[0];
    const texteClient = [
      `${prenom ? prenom + ", m" : "M"}erci pour votre commande ! 🌙`,
      ``,
      `Nous préparons votre colis avec soin — expédition sous 48 h ouvrées.`,
      `Vous recevrez le numéro de suivi dès l'envoi.`,
      ``,
      `VOTRE COMMANDE`,
      lignes,
      `  Livraison : ${c.livraison.libelle} — ${euro(c.livraison.montantCents)}`,
      `  Total payé : ${euro(c.totalCents)}`,
      ``,
      c.livraison.pointRelais
        ? `📍 Livraison en point relais : si ce n'est pas déjà fait, indiquez votre relais sur la page de confirmation, ou répondez simplement à cet e-mail.`
        : `📦 Livraison à domicile à l'adresse indiquée lors du paiement.`,
      ``,
      `Une question ? Répondez à cet e-mail ou écrivez-nous : contact@nur-store.com`,
      ``,
      `Qu'Allah vous récompense pour votre confiance.`,
      `L'équipe NUR — nur-store.com`,
    ].join("\n");
    await envoyerEmail(c.client.email, `Votre commande NUR est confirmée ✓`, texteClient);
  }
}
