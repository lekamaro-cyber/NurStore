/* ===== NUR STORE — logique panier & checkout ===== */

// PRÉ-LANCEMENT : passe à false pour ouvrir les commandes (et retire le
// bandeau .prelaunch-banner dans index.html).
const PRELAUNCH = true;

const CART_KEY = "nur_cart";
let CATALOG = {}; // { id: {id, name, price, description} }

const euro = (cents) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

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
  const housseRow = housse ? `
    <label class="option-row">
      <input type="checkbox" id="withHousse" checked />
      <span class="option-text">
        <strong>Ajouter la housse de protection</strong>
        <small>${housse.description}</small>
      </span>
      <span class="option-price">+ ${euro(housse.price)}</span>
    </label>` : "";
  $("buyPanel").innerHTML = `
    <h2>${p.name}</h2>
    <div class="buy-price">${euro(p.price)} <small>TTC</small></div>
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
      <span>Paiement sécurisé par carte bancaire</span>
      <span>Livraison en France</span>
      <span>Horaires en français & arabe</span>
    </div>
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
  };
}

/* ---- compteur ---- */
function updateCount() {
  const n = cartCount();
  $("cartCount").textContent = n;
  $("cartCount").style.display = n > 0 ? "flex" : "none";
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
  $("checkoutBtn").disabled = entries.length === 0;
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
  if (PRELAUNCH) {
    msg.textContent = "Les commandes ouvrent très bientôt — suivez-nous sur Instagram pour être prévenu !";
    return;
  }
  btn.disabled = true;
  msg.textContent = "Redirection vers le paiement…";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
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

init();
