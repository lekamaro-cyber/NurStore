# TODO / Roadmap — Nur Store

## 📍 Phase 1 (en cours) — Écouler les 40 tablettes via l'auto-entreprise (France)

- [x] **Stripe live** ✅ (clé restreinte rk_live + webhook live, commande de
      validation 1 € passée — penser à la REMBOURSER dans Stripe → Paiements).
- [x] **Emails** ✅ : domaine nur-store.com vérifié chez Resend, confirmation
      client envoyée depuis commandes@nur-store.com (RESEND_FROM).
- [x] **Bandeau pré-lancement retiré** ✅ — BOUTIQUE OUVERTE.
- [ ] Supprimer (ou garder) la page cachée `/commande-test.html` quand les
      tests sont finis — elle déclenche de vrais paiements de 1 €.
- [x] **Stock limité (38)** : compteur Netlify Blobs alimenté par le webhook,
      checkout bloqué à épuisement, site en « Rupture de stock » automatique,
      badge « Plus que X » sous 10 restantes. Total ajustable via la variable
      d'environnement `STOCK_TOTAL` (défaut 38). Les compteurs test et live
      sont séparés : les commandes de test n'entament pas le stock réel.
- [ ] **Médiateur consommation** : adhésion en cours — dès validation, publier le nom
      et les coordonnées dans `public/cgv.html` (section 8, remplacer la phrase provisoire).
- [ ] **INPI** : ajouter l'activité de vente de marchandises à l'auto-entreprise
      (guichet unique, gratuit) — fiscalement plus avantageux (abattement 71 %).
- [x] **Vidéo 30 s** intégrée en vidéo principale de l'accueil (meilleure performance : 2000 vues en 3 jours).
- [x] **Sendcloud** ✅ : compte ouvert, Mondial Relay + Colissimo activés,
      étiquettes via le dashboard, e-mails de suivi aux couleurs NUR.
- [x] **Carte des points relais en production** ✅ : Sendcloud Service Point
      Picker intégré sur success.html (clé publique, carte pré-centrée sur le
      code postal client). Remplace le widget MR BDTEST13 qui affichait un
      bandeau « version de test » (signalé par le 1er client, 19/07).
      Validé en réel le 19/07 (carte propre, sans bandeau).
- [ ] **Import auto des commandes dans Sendcloud** : code en place (webhook →
      annonce du colis, carte → relais rattaché automatiquement). Pour
      l'activer : ajouter `SENDCLOUD_PUBLIC_KEY` et `SENDCLOUD_SECRET_KEY`
      dans Netlify (Site configuration → Environment variables) puis
      **Trigger deploy**. Optionnel : `SENDCLOUD_WEIGHT` (poids par défaut
      du colis en kg, défaut « 1.000 »).

## 🎬 Phase 1bis (avant ouverture des ventes) — Contenu explicatif

> Décision : créer du contenu (unboxing, explications) avant de passer Stripe en live.

Idées de vidéos (Shorts YouTube + Reels Instagram, formats verts 30-60 s) :
- [ ] **Unboxing** : ce qu'il y a dans la boîte (tablette, housse, câble…).
- [ ] **Premier démarrage** : le wizard en 6 étapes (langue → ville → méthode → muezzin) — montre que c'est simple, ~2 min.
- [ ] **L'adhan retentit** : l'alerte plein écran + les 9 muezzins au choix.
- [ ] **Lire le Coran** : navigation, traduction, tafsir, audio verset par verset.
- [ ] **Le mode veille** : les horaires restent affichés même en veille (argument e-ink fort).
- [ ] **Pourquoi e-ink ?** : comparaison avec un téléphone (yeux, distraction, batterie).
- [ ] **Mode Ramadan** : Imsak/Iftar + compte à rebours.
- [ ] FAQ filmées : « faut-il un abonnement ? », « ça marche dans ma ville ? »

Côté site quand les vidéos existent :
- [x] Page « Découvrir NUR » créée (/decouvrir.html) : présentation + 3 emplacements (unboxing, premier démarrage, Coran). Ajouter les IDs YouTube au fur et à mesure.
- [ ] Intégrer la vidéo 30 s.

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
