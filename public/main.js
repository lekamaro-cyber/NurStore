/* ===== NUR STORE — logique panier & checkout ===== */

const CART_KEY = "nur_cart";
let CATALOG = {}; // { id: {id, name, price, description} }
let STOCK = { remaining: Infinity }; // état du stock (rempli par /api/stock)
let PAYPAL = { actif: false, clientId: null }; // fractionné (rempli par /api/paypal/status)

const euro = (cents) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * Mensualité affichée pour le paiement en plusieurs fois (PayPal, 4 fois).
 *
 * PayPal calcule lui-même la répartition exacte. On arrondit la mensualité vers
 * le BAS — jamais annoncer plus cher que la réalité — et on affiche le total
 * exact à côté, qui est le chiffre qui engage. L'écart éventuel d'un centime
 * sur la première échéance perd alors toute portée.
 *
 * Renvoie null hors des bornes de PayPal (20 € à 3 000 €) : afficher une
 * facilité que le client ne verra pas au moment de payer serait pire que de ne
 * rien afficher.
 */
const SPLIT_MIN_CENTS = 2000;
/** Tarifs de livraison — doivent rester alignés sur netlify/lib/catalogue.mts. */
const LIVRAISON_CENTS = { relay: 500, home: 1000 };
const SPLIT_MAX_CENTS = 300000;
const splitPay = (totalCents, n = 4) =>
  PAYPAL.actif && totalCents >= SPLIT_MIN_CENTS && totalCents <= SPLIT_MAX_CENTS
    ? { each: euro(Math.floor(totalCents / n)), total: euro(totalCents), n }
    : null;

/** Le code promo n'est pas cumulable avec le paiement en plusieurs fois. */
const promoSaisi = () => {
  const i = $("promoInput");
  return !!(i && i.value.trim());
};

/* ---- état du panier ---- */
const loadCart = () => {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
};
const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));

let cart = loadCart();

const cartCount = () => Object.values(cart).reduce((n, q) => n + q, 0);
const cartTotal = () =>
  Object.entries(cart).reduce((sum, [id, qty]) => sum + (CATALOG[id]?.price || 0) * qty, 0);

/* ---- éléments ---- */
const $ = (id) => document.getElementById(id);

/* ---- chargement du catalogue ---- */
async function init() {
  try {
    const res = await fetch("products.json");
    const data = await res.json();
    data.products.forEach((p) => { CATALOG[p.id] = p; });
  } catch (e) {
    console.error("Catalogue introuvable", e);
  }
  // État du stock (si l'appel échoue, on n'empêche pas l'affichage :
  // le contrôle strict est fait côté serveur au moment du paiement).
  try {
    const res = await fetch("/api/stock");
    if (res.ok) STOCK = await res.json();
  } catch (e) { /* silencieux */ }
  // Fractionné : disponible seulement si PayPal est configuré ET en production
  // (ou si l'URL porte ?pp=test, pour essayer sans l'exposer au public).
  try {
    const essai = new URLSearchParams(location.search).get("pp") === "test" ? "?pp=test" : "";
    const res = await fetch("/api/paypal/status" + essai);
    if (res.ok) PAYPAL = await res.json();
  } catch (e) { /* silencieux : le comptant reste disponible */ }
  // Révèle les mentions écrites en dur dans le HTML (barre d'achat, FAQ).
  if (PAYPAL.actif) {
    document.querySelectorAll("[data-paypal-only]").forEach((e) => e.classList.add("pp-dispo"));
  }

  // Offre de lancement publique : bandeau + champ code pré-rempli.
  if (STOCK.promo) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<a href="#commander" class="promo-banner">🎁 Offre de lancement : housse + livraison <strong>offertes</strong> avec le code <strong>${STOCK.promo}</strong></a>`
    );
    const promoInput = $("promoInput");
    if (promoInput && !promoInput.value) promoInput.value = STOCK.promo;
  }
  // Saisir ou effacer le code fait apparaître/disparaître la mention du
  // fractionné dans le tiroir, puisque les deux ne se cumulent pas.
  const pi = $("promoInput");
  if (pi) pi.addEventListener("input", renderCart);
  document
    .querySelectorAll('input[name="ppShip"]')
    .forEach((r) => r.addEventListener("change", renderCart));
  const retirer = $("btnRetirerPromo");
  if (retirer) retirer.onclick = () => { $("promoInput").value = ""; renderCart(); };
  renderBuyPanel();
  renderCart();
  updateCount();
  $("year").textContent = "2026";
}

/* ---- panneau d'achat ---- */
let selectedQty = 1;
function renderBuyPanel() {
  const p = CATALOG["nur-tablet"];
  const housse = CATALOG["nur-housse"];
  if (!p) return;
  // Rupture de stock : panneau dédié, pas d'achat possible.
  if (STOCK.remaining <= 0) {
    $("buyPanel").innerHTML = `
      <h2>${p.name}</h2>
      <div class="buy-price">${euro(p.price)} <small>TTC</small></div>
      <p class="buy-desc">${p.description}</p>
      <div class="soldout">😔 Rupture de stock — la première série est épuisée.</div>
      <p class="soldout-note">Suivez-nous sur
        <a href="https://instagram.com/nur_tab_official" target="_blank" rel="noopener">Instagram</a>
        pour être prévenu du réassort.</p>
    `;
    return;
  }
  const stockBadge = (STOCK.remaining <= 10)
    ? `<div class="stock-badge">🔥 Plus que ${STOCK.remaining} exemplaire${STOCK.remaining > 1 ? "s" : ""} disponible${STOCK.remaining > 1 ? "s" : ""}</div>`
    : "";
  const promoTag = STOCK.promo
    ? `<div class="promo-tag">🎁 Offre de lancement — avec le code <strong>${STOCK.promo}</strong> : housse <strong>offerte</strong> et livraison <strong>offerte</strong> (le code est déjà pré-rempli dans votre panier)</div>`
    : "";
  const housseRow = housse ? `
    <label class="option-row">
      <input type="checkbox" id="withHousse" checked />
      ${housse.image ? `<img class="option-thumb" src="${housse.image}" alt="Housse de protection NUR" />` : ""}
      <span class="option-text">
        <strong>Ajouter la housse de protection</strong>
        <small>${housse.description}</small>
      </span>
      <span class="option-price">+ ${euro(housse.price)}</span>
    </label>` : "";
  const split = splitPay(p.price);
  const splitRow = split
    ? `<div class="buy-split">ou <strong>${split.n} × ${split.each}</strong> sans frais avec PayPal —
         soit ${split.total} au total hors livraison, sans intérêts ni pénalité de retard.
         <small>Non cumulable avec l'offre de lancement.</small></div>`
    : "";
  $("buyPanel").innerHTML = `
    <h2>${p.name}</h2>
    <div class="buy-price">${euro(p.price)} <small>TTC</small></div>
    ${splitRow}
    ${stockBadge}
    ${promoTag}
    <p class="buy-desc">${p.description}</p>
    ${housseRow}
    <div class="qty">
      <label>Quantité</label>
      <div class="qty-control">
        <button type="button" id="qtyMinus" aria-label="Diminuer">−</button>
        <span id="qtyValue">1</span>
        <button type="button" id="qtyPlus" aria-label="Augmenter">+</button>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="addToCart">Ajouter au panier</button>
    <div class="buy-reassure">
      <span><strong>Satisfait ou remboursé 14 jours</strong> — retournez-la, remboursement intégral</span>
      <span>Paiement sécurisé (Stripe · Visa · Mastercard) — vos données bancaires ne passent jamais par notre site</span>
      <span>Expédié de France sous 48 h, envoi suivi et assuré</span>
    </div>
    <div class="pay-logos">
      <span class="pay-label">Paiement 100&nbsp;% sécurisé :</span>
      <span class="pay-badge pay-visa">VISA</span>
      <span class="pay-badge pay-mc"><i></i><i></i></span>
      <span class="pay-badge pay-cb">CB</span>
      <span class="pay-badge pay-stripe">Stripe</span>
    </div>
    <p class="buy-anchor">📚 À elle seule, la bibliothèque qu'elle contient (mushaf, tafsir, recueils de hadith) vaut plus de 100 € en livres papier.</p>
    <a class="wa-inline" href="#" target="_blank" rel="noopener">💬 Une question avant de commander ? Écrivez-nous sur WhatsApp — réponse rapide</a>
  `;
  $("qtyMinus").onclick = () => { selectedQty = Math.max(1, selectedQty - 1); $("qtyValue").textContent = selectedQty; };
  $("qtyPlus").onclick = () => { selectedQty = Math.min(10, selectedQty + 1); $("qtyValue").textContent = selectedQty; };
  $("addToCart").onclick = () => {
    cart["nur-tablet"] = (cart["nur-tablet"] || 0) + selectedQty;
    const wantsHousse = $("withHousse") && $("withHousse").checked;
    if (wantsHousse && housse) {
      cart["nur-housse"] = (cart["nur-housse"] || 0) + selectedQty;
    }
    saveCart(cart); renderCart(); updateCount(); openDrawer();
    if (window.nurStat) window.nurStat("ev", "panier:ajout");
  };
}

/* ---- compteur ---- */
function updateCount() {
  const n = cartCount();
  $("cartCount").textContent = n;
  $("cartCount").style.display = n > 0 ? "flex" : "none";
}


/* ---- paiement en 4 fois (PayPal) ----
   Chargé à la demande : tant que le fractionné n'est pas actif, aucune requête
   vers PayPal n'est faite et le SDK n'est pas téléchargé. */
let sdkPaypal = null;
const chargerSdkPaypal = () => {
  if (sdkPaypal) return sdkPaypal;
  sdkPaypal = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src =
      "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(PAYPAL.clientId) +
      "&currency=EUR&locale=fr_FR&enable-funding=paylater&intent=capture";
    s.onload = res;
    s.onerror = () => rej(new Error("SDK PayPal indisponible"));
    document.head.appendChild(s);
  });
  return sdkPaypal;
};

const modeLivraisonChoisi = () =>
  (document.querySelector('input[name="ppShip"]:checked') || {}).value || "relay";

let boutonsPaypalRendus = false;

async function monterBoutonsPaypal() {
  const bloc = $("paypalBlock");
  if (!bloc) return;
  // Le fractionné n'est pas cumulable avec le code promo : si un code est
  // saisi, on retire le bouton plutôt que de laisser le serveur refuser après
  // coup — un refus au moment de payer serait vécu comme une panne.
  // Le bloc s'affiche dès que le montant le permet ; c'est le code promo qui
  // décide ensuite ce qu'on y montre. Le faire disparaître sans explication
  // revenait à supprimer l'offre pour tout le monde, puisque le code de
  // lancement est pré-rempli automatiquement.
  const dansLesBornes =
    splitPay(cartTotal() + (LIVRAISON_CENTS[modeLivraisonChoisi()] ?? 0)) !== null;
  bloc.hidden = !(PAYPAL.actif && dansLesBornes);
  if (bloc.hidden) return;

  const conflit = promoSaisi();
  $("paypalConflit").hidden = !conflit;
  $("paypalChoix").hidden = conflit;
  if (conflit || boutonsPaypalRendus) return;

  try {
    await chargerSdkPaypal();
  } catch (e) {
    $("paypalMsg").textContent = "Le paiement en plusieurs fois est momentanément indisponible.";
    return;
  }
  boutonsPaypalRendus = true;

  window.paypal
    .Buttons({
      style: { layout: "vertical", label: "pay", height: 45 },
      createOrder: async () => {
        $("paypalMsg").textContent = "";
        const r = await fetch("/api/paypal/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: Object.entries(cart).map(([id, quantity]) => ({ id, quantity })),
            livraison: modeLivraisonChoisi(),
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Création de commande impossible");
        return d.id;
      },
      onApprove: async (data) => {
        $("paypalMsg").textContent = "Finalisation du paiement…";
        const r = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID }),
        });
        const d = await r.json();
        if (!r.ok) {
          $("paypalMsg").textContent = d.error || "Le paiement n'a pas pu être finalisé.";
          return;
        }
        // Panier vidé seulement après encaissement confirmé.
        cart = {}; saveCart(cart); updateCount();
        const relais = modeLivraisonChoisi() === "relay" ? "&relay=1" : "";
        location.href = "success.html?ref=" + encodeURIComponent(d.reference) + relais;
      },
      onError: (err) => {
        console.error("PayPal", err);
        $("paypalMsg").textContent =
          "Le paiement en plusieurs fois a rencontré un problème. Vous pouvez payer comptant ci-dessus.";
      },
    })
    .render("#paypalButtons")
    .catch((e) => {
      console.error("Rendu PayPal", e);
      bloc.hidden = true;
    });
}

/* ---- rendu du panier ---- */
function renderCart() {
  const items = $("drawerItems");
  const entries = Object.entries(cart).filter(([id, q]) => q > 0 && CATALOG[id]);
  if (!entries.length) {
    items.innerHTML = `<p class="drawer-empty">Votre panier est vide.</p>`;
  } else {
    items.innerHTML = entries.map(([id, qty]) => {
      const p = CATALOG[id];
      const thumbStyle = p.image ? ` style="background-image:url('${p.image}')"` : "";
      return `
        <div class="cart-line">
          <div class="cart-line-thumb"${thumbStyle}></div>
          <div class="cart-line-info">
            <div class="cart-line-name">${p.name}</div>
            <div class="cart-line-price">${euro(p.price)}</div>
            <div class="cart-line-qty">
              <button data-dec="${id}">−</button>
              <span>${qty}</span>
              <button data-inc="${id}">+</button>
              <button class="cart-line-remove" data-rm="${id}">Retirer</button>
            </div>
          </div>
        </div>`;
    }).join("");
    items.querySelectorAll("[data-dec]").forEach((b) => b.onclick = () => changeQty(b.dataset.dec, -1));
    items.querySelectorAll("[data-inc]").forEach((b) => b.onclick = () => changeQty(b.dataset.inc, 1));
    items.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { delete cart[b.dataset.rm]; saveCart(cart); renderCart(); updateCount(); });
  }
  $("drawerTotal").textContent = euro(cartTotal());
  // Le fractionné suit le sous-total, et disparaît dès qu'un code promo est
  // saisi : les deux ne sont pas cumulables, autant ne pas le promettre.
  // Livraison comprise : c'est le montant que PayPal débitera vraiment. Annoncer
  // la mensualité sur le seul sous-total la sous-estimerait, et le client
  // découvrirait l'écart sur la page de paiement.
  const totalAvecPort = cartTotal() + (LIVRAISON_CENTS[modeLivraisonChoisi()] ?? 0);
  const dsplit = entries.length && !promoSaisi() ? splitPay(totalAvecPort) : null;
  const dnode = $("drawerSplit");
  if (dnode) {
    dnode.innerHTML = dsplit
      ? `ou <strong>${dsplit.n} × ${dsplit.each}</strong> sans frais avec PayPal, livraison comprise`
      : "";
    dnode.hidden = !dsplit;
  }
  $("checkoutBtn").disabled = entries.length === 0;
  monterBoutonsPaypal();
}

function changeQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  if (cart[id] === 0) delete cart[id];
  saveCart(cart); renderCart(); updateCount();
}

/* ---- drawer ---- */
const openDrawer = () => { $("cartDrawer").classList.add("open"); $("drawerOverlay").classList.add("open"); };
const closeDrawer = () => { $("cartDrawer").classList.remove("open"); $("drawerOverlay").classList.remove("open"); };
$("cartBtn").onclick = openDrawer;
$("drawerClose").onclick = closeDrawer;
$("drawerOverlay").onclick = closeDrawer;

/* ---- checkout Stripe ---- */
$("checkoutBtn").onclick = async () => {
  const btn = $("checkoutBtn");
  const msg = $("drawerMsg");
  const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
  if (!items.length) return;
  if (window.nurStat) window.nurStat("ev", "panier:paiement");
  btn.disabled = true;
  msg.textContent = "Redirection vers le paiement…";
  try {
    const promo = ($("promoInput") ? $("promoInput").value : "").trim();
    if (promo && window.nurStat) window.nurStat("ev", "panier:code");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, promo }),
    });
    const data = await res.json();
    if (res.ok && data.url) {
      window.location.href = data.url;
    } else {
      msg.textContent = data.error || "Le paiement n'est pas encore configuré.";
      btn.disabled = false;
    }
  } catch (e) {
    msg.textContent = "Erreur réseau. Réessaie dans un instant.";
    btn.disabled = false;
  }
};

/* ---- barre d'achat collante (mobile) ---- */
(function () {
  const bar = $("buyBar");
  const buySection = document.getElementById("commander");
  if (!bar || !buySection) return;
  let buyVisible = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      buyVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.15 }).observe(buySection);
  }
  function update() {
    const scrolled = window.scrollY > 450;
    const show = scrolled && !buyVisible;
    bar.classList.toggle("show", show);
    document.body.classList.toggle("has-buybar", show);
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
})();

init();
