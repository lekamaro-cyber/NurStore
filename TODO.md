# TODO / Roadmap — Nur Store

## 📍 Phase 1 (en cours) — Écouler les 40 tablettes via l'auto-entreprise (France)

- [ ] **Stripe live** : activer le compte (IBAN, infos AE) → remplacer `STRIPE_SECRET_KEY`
      (`sk_test_` → `sk_live_`) dans Netlify + recréer le webhook **en mode live**
      (nouvelle valeur `STRIPE_WEBHOOK_SECRET`) → commande réelle de validation.
- [ ] **Médiateur consommation** : adhésion en cours — dès validation, publier le nom
      et les coordonnées dans `public/cgv.html` (section 8, remplacer la phrase provisoire).
- [ ] **INPI** : ajouter l'activité de vente de marchandises à l'auto-entreprise
      (guichet unique, gratuit) — fiscalement plus avantageux (abattement 71 %).
- [ ] **Vidéo 30 s** : à intégrer quand le lien YouTube est prêt (où : à décider).
- [ ] **Boxtal/Sendcloud** : ouvrir un compte quand les commandes s'enchaînent
      (tarifs négociés + étiquettes centralisées).
- [ ] **Code enseigne Mondial Relay** : quand compte MR pro ouvert, remplacer
      `MR_BRAND = "BDTEST13"` dans `public/success.html` par le vrai code enseigne.

## 🌍 Phase 2 — La société UAE prend le relais (international)

> Décision actée : une fois les 40 unités vendues par l'auto-entreprise française,
> la société aux Émirats reprend la vente avec un positionnement international.

Ce que la bascule impliquera (checklist de migration) :

- [ ] **Stripe UAE** : ouvrir un compte Stripe au nom de la société émiratie
      (Stripe supporte les entreprises UAE) → nouvelles clés dans Netlify.
- [ ] **Pages légales à réécrire** : CGV + mentions légales au nom de la société UAE
      (le vendeur change d'entité juridique — droit applicable, TVA/taxes à revoir
      selon les pays ciblés ; se faire conseiller sur la TVA UE / IOSS pour vendre
      aux consommateurs européens depuis hors-UE).
- [ ] **Site multilingue** : ajouter EN (et AR ?) — l'app NUR est déjà en 11 langues,
      le site doit suivre pour l'international.
- [ ] **Devises** : afficher/facturer en EUR + USD (+ AED ?) — Stripe gère le multi-devises.
- [ ] **Livraison internationale** : élargir `SHIPPING_COUNTRIES` dans
      `netlify/functions/create-checkout.mts` + définir transporteurs/tarifs par zone
      (douane/DDP à étudier pour l'UE si expédition depuis hors-UE).
- [ ] **Logistique** : décider d'où partent les colis (stock UE ? 3PL ? depuis UAE ?).
- [ ] **Emails** : passer Resend sur le domaine nur-store.com (domaine vérifié)
      pour envoyer depuis contact@nur-store.com au lieu de onboarding@resend.dev.

## 💡 Idées en vrac (non planifié)

- Page « À propos / Notre histoire » (storytelling de la marque NÜR).
- Avis clients sur la page produit après les premières ventes.
- Analytics respectueux (Plausible/Umami) pour suivre le trafic sans cookies.
- Packs (tablette + housse) avec prix bundle.
