import Stripe from "stripe";
import type { Config } from "@netlify/functions";
import { sendcloudConfigured } from "../lib/sendcloud.mts";

/**
 * Reçoit le point relais choisi par le client (page de confirmation)
 * et l'envoie par e-mail au marchand, rattaché à la commande Stripe.
 */

async function sendEmail(subject: string, text: string): Promise<boolean> {
  const key = Netlify.env.get("RESEND_API_KEY");
  const to = Netlify.env.get("ORDER_NOTIFY_EMAIL");
  if (!key || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "NUR Store <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: { session_id?: string; email?: string; relais?: string; service_point_id?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const sessionId = (body.session_id || "").trim();
  const relais = (body.relais || "").trim().slice(0, 600);
  const email = (body.email || "").trim().slice(0, 200);
  if (!sessionId.startsWith("cs_") || !relais) {
    return Response.json({ error: "Données manquantes." }, { status: 400 });
  }

  // Vérifie que la session correspond à une vraie commande payée.
  const secret = Netlify.env.get("STRIPE_SECRET_KEY");
  let customerName = "";
  let amount = "";
  if (secret) {
    try {
      const stripe = new Stripe(secret);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return Response.json({ error: "Commande introuvable." }, { status: 403 });
      }
      customerName = session.customer_details?.name ?? "";
      amount = ((session.amount_total ?? 0) / 100).toFixed(2).replace(".", ",") + " €";
    } catch {
      return Response.json({ error: "Commande introuvable." }, { status: 403 });
    }
  }

  // Le choix sur la carte fournit l'id Sendcloud du point relais :
  // on le met dans l'e-mail pour le retrouver vite au moment de l'étiquette.
  let sendcloudNote = "";
  const spId = Number(body.service_point_id);
  if (sendcloudConfigured()) {
    sendcloudNote = spId > 0
      ? `SENDCLOUD : commande NUR-${sessionId.slice(-6).toUpperCase()} — sélectionner ce relais (id Sendcloud ${spId}) au moment de l'étiquette.`
      : `SENDCLOUD : commande NUR-${sessionId.slice(-6).toUpperCase()} — sélectionner ce relais au moment de l'étiquette.`;
  }

  const ok = await sendEmail(
    `📍 Point relais — commande de ${customerName || email}`,
    [
      `POINT RELAIS CHOISI PAR LE CLIENT`,
      ``,
      `  Client  : ${customerName || "—"} (${email || "—"})`,
      `  Montant : ${amount || "—"}`,
      ``,
      `  Relais  :`,
      `  ${relais}`,
      ``,
      sendcloudNote,
      ``,
      `Référence Stripe : ${sessionId}`,
    ].join("\n")
  );

  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "Envoi impossible pour le moment." }, { status: 502 });
};

export const config: Config = {
  path: "/api/relay",
};
