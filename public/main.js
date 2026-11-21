/* ===== NUR STORE — logique panier & checkout ===== */

const CART_KEY = "nur_cart";
let CATALOG = {}; // { id: {id, name, price, description} }
let STOCK = { remaining: Infinity }; // état du stock (rempli par /api/stock)
let PAYPAL = { actif: false, clientId: null }; // fractionné (rempli par /api/paypal/status)

/* ---- langue de la page (/ = fr, /en/, /ar/) : textes du panier et format des prix ---- */
const LANG = document.documentElement.lang === "en" ? "en" : document.documentElement.lang === "ar" ? "ar" : "fr";
const LOCALE = { fr: "fr-FR", en: "en-IE", ar: "ar-u-nu-latn" }[LANG];
const T = {
  fr: {
    promoBanner: (code) => `🎁 Offre de lancement : housse + livraison <strong>offertes</strong> avec le code <strong>${code}</strong>`,
    ttc: "TTC", soldout: "😔 Rupture de stock — la première série est épuisée.",
    soldoutNote: (a) => `Suivez-nous sur ${a} pour être prévenu du réassort.`,
    stock: (n) => `🔥 Plus que ${n} exemplaire${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}`,
    promoTag: (code) => `🎁 Offre de lancement — avec le code <strong>${code}</strong> : housse <strong>offerte</strong> et livraison <strong>offerte</strong> (le code est déjà pré-rempli dans votre panier)`,
    housseAlt: "Housse de protection NUR", housseAdd: "Ajouter la housse de protection",
    split: (s) => `ou <strong>${s.n} × ${s.each}</strong> sans frais avec PayPal —
         soit ${s.total} au total hors livraison, sans intérêts ni pénalité de retard.
         <small>Non cumulable avec l'offre de lancement.</small>`,
    qty: "Quantité", minus: "Diminuer", plus: "Augmenter", add: "Ajouter au panier",
    reassure1: "<strong>Satisfait ou remboursé 14 jours</strong> — retournez-la, remboursement intégral",
    reassure2: "Paiement sécurisé (Stripe · Visa · Mastercard) — vos données bancaires ne passent jamais par notre site",
    reassure3: "Expédié de France sous 48 h, envoi suivi et assuré",
    payLabel: "Paiement 100&nbsp;% sécurisé :",
    anchor: "📚 À elle seule, la bibliothèque qu'elle contient (mushaf, tafsir, recueils de hadith) vaut plus de 100 € en livres papier.",
    wa: "💬 Une question avant de commander ? Écrivez-nous sur WhatsApp — réponse rapide",
    empty: "Votre panier est vide.", remove: "Retirer",
    drawerSplit: (s) => `ou <strong>${s.n} × ${s.each}</strong> sans frais`,
    ppUnavailable: "Le paiement en plusieurs fois est momentanément indisponible.",
    ppCreate: "Création de commande impossible", ppFinalizing: "Finalisation du paiement…",
    ppFailed: "Le paiement n'a pas pu être finalisé.",
    ppError: "Le paiement en plusieurs fois a rencontré un problème. Vous pouvez payer comptant ci-dessus.",
    redirect: "Redirection vers le paiement…", notConfigured: "Le paiement n'est pas encore configuré.",
    network: "Erreur réseau. Réessaie dans un instant.",
  },
  en: {
    promoBanner: (code) => `🎁 Launch offer: cover + shipping <strong>free</strong> with the code <strong>${code}</strong>`,
    ttc: "incl. VAT", soldout: "😔 Sold out — the first batch is gone.",
    soldoutNote: (a) => `Follow us on ${a} to be told when it is back in stock.`,
    stock: (n) => `🔥 Only ${n} left`,
    promoTag: (code) => `🎁 Launch offer — with the code <strong>${code}</strong>: <strong>free</strong> cover and <strong>free</strong> shipping (the code is already filled in your cart)`,
    housseAlt: "NUR protective cover", housseAdd: "Add the protective cover",
    split: (s) => `or <strong>${s.n} × ${s.each}</strong> interest-free with PayPal —
         ${s.total} in total excluding shipping, no interest, no late fees.
         <small>Cannot be combined with the launch offer.</small>`,
    qty: "Quantity", minus: "Decrease", plus: "Increase", add: "Add to cart",
    reassure1: "<strong>14-day money-back guarantee</strong> — return it for a full refund",
    reassure2: "Secure payment (Stripe · Visa · Mastercard) — your card details never pass through our site",
    reassure3: "Shipped from France within 48 h, tracked and insured",
    payLabel: "100&nbsp;% secure payment:",
    anchor: "📚 The library it holds (mushaf, tafsir, hadith collections) alone is worth over €100 in printed books.",
    wa: "💬 A question before ordering? Write to us on WhatsApp — quick reply",
    empty: "Your cart is empty.", remove: "Remove",
    drawerSplit: (s) => `or <strong>${s.n} × ${s.each}</strong> interest-free`,
    ppUnavailable: "Instalment payment is temporarily unavailable.",
    ppCreate: "Could not create the order", ppFinalizing: "Finalising payment…",
    ppFailed: "The payment could not be completed.",
    ppError: "Instalment payment ran into a problem. You can pay in full above.",
    redirect: "Redirecting to payment…", notConfigured: "Payment is not configured yet.",
    network: "Network error. Please try again in a moment.",
  },
  ar: {
    promoBanner: (code) => `🎁 عرض الإطلاق: الغطاء والشحن <strong>مجاناً</strong> مع الرمز <strong>${code}</strong>`,
    ttc: "شامل الضريبة", soldout: "😔 نفدت الكمية — الدفعة الأولى بيعت بالكامل.",
    soldoutNote: (a) => `تابعنا على ${a} لنخبرك عند توفرها من جديد.`,
    stock: (n) => `🔥 لم يتبقَّ سوى ${n}`,
    promoTag: (code) => `🎁 عرض الإطلاق — مع الرمز <strong>${code}</strong>: الغطاء <strong>مجاناً</strong> والشحن <strong>مجاناً</strong> (الرمز مُدخل مسبقاً في سلتك)`,
    housseAlt: "غطاء حماية NUR", housseAdd: "إضافة غطاء الحماية",
    split: (s) => `أو <strong>${s.n} × ${s.each}</strong> بدون فوائد عبر PayPal —
         أي ${s.total} إجمالاً دون الشحن، بلا فوائد ولا غرامات تأخير.
         <small>لا يُجمع مع عرض الإطلاق.</small>`,
    qty: "الكمية", minus: "إنقاص", plus: "زيادة", add: "أضف إلى السلة",
    reassure1: "<strong>ضمان استرداد المبلغ خلال 14 يوماً</strong> — أعده واسترد المبلغ كاملاً",
    reassure2: "دفع آمن (Stripe · Visa · Mastercard) — بيانات بطاقتك لا تمر عبر موقعنا أبداً",
    reassure3: "يُشحن من فرنسا خلال 48 ساعة، شحن متتبَّع ومؤمَّن",
    payLabel: "دفع آمن 100&nbsp;% :",
    anchor: "📚 المكتبة التي يحتويها وحدها (مصحف، تفسير، كتب حديث) تساوي أكثر من 100 € من الكتب الورقية.",
    wa: "💬 سؤال قبل الطلب؟ راسلنا على WhatsApp — رد سريع",
    empty: "سلتك فارغة.", remove: "إزالة",
    drawerSplit: (s) => `أو <strong>${s.n} × ${s.each}</strong> بدون فوائد`,
    ppUnavailable: "الدفع بالتقسيط غير متاح مؤقتاً.",
    ppCreate: "تعذّر إنشاء الطلب", ppFinalizing: "جارٍ إتمام الدفع…",
    ppFailed: "تعذّر إتمام الدفع.",
    ppError: "واجه الدفع بالتقسيط مشكلة. يمكنك الدفع دفعة واحدة أعلاه.",
    redirect: "جارٍ التحويل إلى صفحة الدفع…", notConfigured: "الدفع غير مهيأ بعد.",
    network: "خطأ في الشبكة. حاول مجدداً بعد لحظة.",
  },
}[LANG];
const nom = (p) => p["name_" + LANG] || p.name;
const descr = (p) => p["description_" + LANG] || p.description;

const euro = (cents) =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" }).format(cents / 100);

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
    const res = await fetch("/products.json");
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
      `<a href="#commander" class="promo-banner">${T.promoBanner(STOCK.promo)}</a>`
    );
    const promoInput = $("promoInput");
    if (promoInput && !promoInput.value) promoInput.value = STOCK.promo;
  }
  // Saisir ou effacer le code fait apparaître/disparaître la mention du
  // fractionné dans le tiroir, puisque les deux ne se cumulent pas.
  const pi = $("promoInput");
  if (pi) pi.addEventListener("input", renderCart);
  document
    .querySelectorAll('input[name="ship"]')
    .forEach((r) => r.addEventListener("change", renderCart));
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
      <h2>${nom(p)}</h2>
      <div class="buy-price">${euro(p.price)} <small>${T.ttc}</small></div>
      <p class="buy-desc">${descr(p)}</p>
      <div class="soldout">${T.soldout}</div>
      <p class="soldout-note">${T.soldoutNote('<a href="https://instagram.com/nur_tab_official" target="_blank" rel="noopener">Instagram</a>')}</p>
    `;
    return;
  }
  const stockBadge = (STOCK.remaining <= 10)
    ? `<div class="stock-badge">${T.stock(STOCK.remaining)}</div>`
    : "";
  const promoTag = STOCK.promo
    ? `<div class="promo-tag">${T.promoTag(STOCK.promo)}</div>`
    : "";
  const housseRow = housse ? `
    <label class="option-row">
      <input type="checkbox" id="withHousse" checked />
      ${housse.image ? `<img class="option-thumb" src="${housse.image}" alt="${T.housseAlt}" />` : ""}
      <span class="option-text">
        <strong>${T.housseAdd}</strong>
        <small>${descr(housse)}</small>
      </span>
      <span class="option-price">+ ${euro(housse.price)}</span>
    </label>` : "";
  const split = splitPay(p.price);
  const splitRow = split
    ? `<div class="buy-split">${T.split(split)}</div>`
    : "";
  $("buyPanel").innerHTML = `
    <h2>${nom(p)}</h2>
    <div class="buy-price">${euro(p.price)} <small>${T.ttc}</small></div>
    ${splitRow}
    ${stockBadge}
    ${promoTag}
    <p class="buy-desc">${descr(p)}</p>
    ${housseRow}
    <div class="qty">
      <label>${T.qty}</label>
      <div class="qty-control">
        <button type="button" id="qtyMinus" aria-label="${T.minus}">−</button>
        <span id="qtyValue">1</span>
        <button type="button" id="qtyPlus" aria-label="${T.plus}">+</button>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="addToCart">${T.add}</button>
    <div class="buy-reassure">
      <span>${T.reassure1}</span>
      <span>${T.reassure2}</span>
      <span>${T.reassure3}</span>
    </div>
    <div class="pay-logos">
      <span class="pay-label">${T.payLabel}</span>
      <span class="pay-badge pay-visa">VISA</span>
      <span class="pay-badge pay-mc"><i></i><i></i></span>
      <span class="pay-badge pay-cb">CB</span>
      <span class="pay-badge pay-stripe">Stripe</span>
    </div>
    <p class="buy-anchor">${T.anchor}</p>
    <a class="wa-inline" href="#" target="_blank" rel="noopener">${T.wa}</a>
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
      // `disable-funding=card` : les cartes passent par Stripe. Laisser PayPal en
      // proposer une troisième entrée dupliquait le moyen de paiement, à des
      // frais différents, et allongeait d'autant un tiroir déjà chargé.
      "&currency=EUR&locale=" + { fr: "fr_FR", en: "en_GB", ar: "ar_EG" }[LANG] + "&enable-funding=paylater&disable-funding=card&intent=capture";
    s.onload = res;
    s.onerror = () => rej(new Error("SDK PayPal indisponible"));
    document.head.appendChild(s);
  });
  return sdkPaypal;
};

const modeLivraison = () =>
  (document.querySelector('input[name="ship"]:checked') || {}).value || "relay";
const portCents = () => LIVRAISON_CENTS[modeLivraison()] ?? 0;

let boutonsPaypalRendus = false;

async function monterBoutonsPaypal() {
  const bloc = $("paypalBlock");
  if (!bloc) return;
  // Le fractionné n'est pas cumulable avec le code promo : si un code est
  // saisi, on retire le bouton plutôt que de laisser le serveur refuser après
  // coup — un refus au moment de payer serait vécu comme une panne.
  // Le code promo ne masque plus le fractionné : il est pré-rempli
  // automatiquement, le bouton n'apparaîtrait donc jamais. Les deux offres
  // restent exclusives — payer en 4 fois se fait au prix plein —, et c'est dit
  // en une ligne sous le séparateur plutôt que par une mécanique de retrait.
  const dansLesBornes = splitPay(cartTotal() + portCents()) !== null;
  bloc.hidden = !(PAYPAL.actif && dansLesBornes);
  if (bloc.hidden) return;

  if (boutonsPaypalRendus) return;

  try {
    await chargerSdkPaypal();
  } catch (e) {
    $("paypalMsg").textContent = T.ppUnavailable;
    return;
  }
  boutonsPaypalRendus = true;

  window.paypal
    .Buttons({
      style: { layout: "vertical", label: "pay", height: 45 },
      createOrder: async () => {
        $("paypalMsg").textContent = "";
        if (window.nurStat) window.nurStat("ev", "panier:4x");
        const r = await fetch("/api/paypal/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: Object.entries(cart).map(([id, quantity]) => ({ id, quantity })),
            livraison: modeLivraison(),
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || T.ppCreate);
        return d.id;
      },
      onApprove: async (data) => {
        $("paypalMsg").textContent = T.ppFinalizing;
        const r = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderID: data.orderID }),
        });
        const d = await r.json();
        if (!r.ok) {
          $("paypalMsg").textContent = d.error || T.ppFailed;
          return;
        }
        // Panier vidé seulement après encaissement confirmé.
        cart = {}; saveCart(cart); updateCount();
        const relais = modeLivraison() === "relay" ? "&relay=1" : "";
        location.href = "success.html?ref=" + encodeURIComponent(d.reference) + relais;
      },
      onError: (err) => {
        console.error("PayPal", err);
        $("paypalMsg").textContent = T.ppError;
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
    items.innerHTML = `<p class="drawer-empty">${T.empty}</p>`;
  } else {
    items.innerHTML = entries.map(([id, qty]) => {
      const p = CATALOG[id];
      const thumbStyle = p.image ? ` style="background-image:url('${p.image}')"` : "";
      return `
        <div class="cart-line">
          <div class="cart-line-thumb"${thumbStyle}></div>
          <div class="cart-line-info">
            <div class="cart-line-name">${nom(p)}</div>
            <div class="cart-line-price">${euro(p.price)}</div>
            <div class="cart-line-qty">
              <button data-dec="${id}">−</button>
              <span>${qty}</span>
              <button data-inc="${id}">+</button>
              <button class="cart-line-remove" data-rm="${id}">${T.remove}</button>
            </div>
          </div>
        </div>`;
    }).join("");
    items.querySelectorAll("[data-dec]").forEach((b) => b.onclick = () => changeQty(b.dataset.dec, -1));
    items.querySelectorAll("[data-inc]").forEach((b) => b.onclick = () => changeQty(b.dataset.inc, 1));
    items.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { delete cart[b.dataset.rm]; saveCart(cart); renderCart(); updateCount(); });
  }
  const sousTotal = cartTotal();
  const port = entries.length ? portCents() : 0;
  const total = sousTotal + port;
  $("drawerSubtotal").textContent = euro(sousTotal);
  $("drawerShip").textContent = euro(port);
  $("drawerTotal").textContent = euro(total);
  $("shipChoice").hidden = entries.length === 0;

  // Le code promo offre housse et livraison, mais seul le serveur peut le
  // valider : le tiroir affiche les prix pleins et annonce l'ajustement.
  const promo = ($("promoInput")?.value || "").trim();
  if ($("promoNote")) $("promoNote").hidden = !promo;

  // La mensualité porte sur le total réellement débité, livraison comprise.
  const dsplit = entries.length ? splitPay(total) : null;
  const dnode = $("drawerSplit");
  if (dnode) {
    dnode.innerHTML = dsplit
      ? T.drawerSplit(dsplit)
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
  msg.textContent = T.redirect;
  try {
    const promo = ($("promoInput") ? $("promoInput").value : "").trim();
    if (promo && window.nurStat) window.nurStat("ev", "panier:code");
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, promo, livraison: modeLivraison(), lang: LANG }),
    });
    const data = await res.json();
    if (res.ok && data.url) {
      window.location.href = data.url;
    } else {
      msg.textContent = data.error || T.notConfigured;
      btn.disabled = false;
    }
  } catch (e) {
    msg.textContent = T.network;
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
