# Nur Store — boutique en ligne de la tablette Nur

Boutique e-commerce (page produit + panier + paiement carte bancaire via Stripe),
hébergée sur **Netlify**, à brancher sur le domaine **nur-store.com** (acheté chez OVH).

Le site est **statique** (rapide, gratuit à héberger) et le paiement passe par une
**fonction serverless** Netlify qui parle à Stripe. Aucune donnée de carte ne transite
par le site.

---

## 🗂️ Structure du projet

```
public/                → le site visible (HTML/CSS/JS)
  index.html           → la page de la boutique
  styles.css           → le design
  main.js              → panier + bouton payer
  products.json        → nom, description et PRIX affiché du produit
  success.html         → page « merci » après paiement
  cancel.html          → page « paiement annulé »
netlify/functions/
  create-checkout.mts  → crée le paiement Stripe (PRIX autoritaire ici)
netlify.toml           → config Netlify
package.json           → dépendances (stripe)
```

---

## ✏️ Modifier le contenu (ce que tu feras le plus souvent)

### Le prix
Le prix est écrit à **deux endroits**, en **centimes** (299,00 € = `29900`) :
1. `public/products.json` → pour l'affichage.
2. `netlify/functions/create-checkout.mts` → le prix réellement facturé (celui qui compte).
Change les deux avec la même valeur.

### Le nom, la description, les caractéristiques
- Nom / description courte : `public/products.json`.
- Textes de la page, specs, FAQ : directement dans `public/index.html`
  (cherche les sections `SPECS`, `FAQ`, `FEATURES`).

### Les photos
Dans `public/index.html`, chaque emplacement photo est un bloc avec
`data-placeholder="..."`. Pour mettre une vraie image :
1. Dépose ta photo dans `public/assets/` (crée le dossier).
2. Remplace le bloc placeholder par une image, par ex. :
   ```html
   <img src="assets/ma-photo.jpg" alt="Tablette Nur" />
   ```
   (ou ajoute `background-image` sur le bloc concerné dans `styles.css`).

### Les vidéos (promo 1 min + 30 s)
On ne met **pas** les fichiers vidéo dans le site (trop lourd). On les héberge sur
**YouTube ou Vimeo** puis on les intègre. Dans `public/index.html`, section `VIDEO`,
remplace le bloc `.video-frame` par ton lecteur, par ex. YouTube :
```html
<div class="video-frame">
  <iframe src="https://www.youtube.com/embed/TON_ID_VIDEO"
          title="Vidéo Nur" allowfullscreen></iframe>
</div>
```

---

## 💳 Activer les paiements (Stripe)

1. Crée un compte sur **https://stripe.com** (société aux Émirats : choisis « United Arab Emirates »).
2. Dans le tableau de bord Stripe → **Developers → API keys**, copie la clé secrète
   (`sk_test_...` en mode test, `sk_live_...` en réel).
3. Dans **Netlify** → ton site → **Site configuration → Environment variables**,
   ajoute une variable :
   - **Clé** : `STRIPE_SECRET_KEY`
   - **Valeur** : ta clé secrète Stripe
4. Redéploie (ou attends le prochain déploiement). Le bouton « Passer au paiement »
   redirige alors vers la vraie page de paiement Stripe.

> Tant que `STRIPE_SECRET_KEY` n'est pas défini, le site fonctionne mais affiche un
> message « paiement pas encore activé » à l'étape de paiement. Rien ne casse.

**Astuce** : commence en **mode test** (clés `sk_test_...`) avec la carte de test Stripe
`4242 4242 4242 4242`, une date future et n'importe quel CVC. Passe en `sk_live_...`
seulement quand tout est prêt.

---

## 🌐 Brancher le domaine nur-store.com (OVH → Netlify)

1. Dans **Netlify** → ton site → **Domain management → Add a domain** → saisis
   `nur-store.com`. Netlify t'indiquera les enregistrements DNS à créer.
2. Connecte-toi à l'espace **OVH** → **Domaines → nur-store.com → Zone DNS**.
3. Ajoute / modifie (Netlify te donne les valeurs exactes, généralement) :
   - un enregistrement **A** `@` → l'IP fournie par Netlify (`75.2.60.5`),
   - un enregistrement **CNAME** `www` → `TON-SITE.netlify.app`.
4. Attends la propagation DNS (de quelques minutes à quelques heures). Netlify active
   ensuite le **HTTPS gratuit** automatiquement.

> Alternative plus simple : déléguer entièrement le DNS à Netlify (Netlify DNS).
> Dans ce cas, tu changes les « serveurs DNS » du domaine chez OVH pour ceux que
> Netlify t'indique. Un seul réglage, mais tout le DNS passe par Netlify.

---

## 🧑‍💻 Développer en local (optionnel)

```bash
npm install
npx netlify dev      # démarre le site + les fonctions en local
```

Pour tester Stripe en local, crée un fichier `.env` avec `STRIPE_SECRET_KEY=sk_test_...`
(déjà ignoré par git).
