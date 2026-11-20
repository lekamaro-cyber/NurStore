// Langue du site : /  = français, /en/ = anglais, /ar/ = arabe.
// 1. Remplit le sélecteur FR / EN / AR avec la même page dans chaque langue.
// 2. Au premier passage, suit la langue du navigateur (choix mémorisé ensuite).
(function () {
  var LANGUES = ["fr", "en", "ar"];
  var CLE = "nur_lang";
  var m = location.pathname.match(/^\/(en|ar)(\/|$)/);
  var courante = m ? m[1] : "fr";
  var page = location.pathname.replace(/^\/(en|ar)(\/|$)/, "/");
  if (page === "/index.html") page = "/";

  var cible = function (lang) {
    return (lang === "fr" ? "" : "/" + lang) + page + location.search + location.hash;
  };
  var memoriser = function (lang) {
    try { localStorage.setItem(CLE, lang); } catch (e) {}
  };

  // Sélecteur : <nav class="lang-switch" data-lang-switch> rempli ici.
  var conteneurs = document.querySelectorAll("[data-lang-switch]");
  for (var i = 0; i < conteneurs.length; i++) {
    var c = conteneurs[i];
    c.innerHTML = "";
    for (var j = 0; j < LANGUES.length; j++) {
      (function (lang) {
        var a = document.createElement("a");
        a.href = cible(lang);
        a.hreflang = lang;
        a.lang = lang;
        a.textContent = lang === "ar" ? "عربي" : lang.toUpperCase();
        if (lang === courante) { a.className = "actif"; a.setAttribute("aria-current", "true"); }
        a.addEventListener("click", function () { memoriser(lang); });
        c.appendChild(a);
      })(LANGUES[j]);
    }
  }

  // Redirection automatique : seulement depuis le français, sans choix mémorisé,
  // et jamais sur les pages de retour de paiement.
  if (courante !== "fr" || /^\/(success|cancel|stats|commande-test)\.html$/.test(page)) return;
  var choix = null;
  try { choix = localStorage.getItem(CLE); } catch (e) {}
  if (choix) return;
  var pref = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  var code = pref.slice(0, 2).toLowerCase();
  memoriser(code === "en" || code === "ar" ? code : "fr");
  if (code === "en" || code === "ar") location.replace(cible(code));
})();
