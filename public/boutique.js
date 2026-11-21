/* Lien WhatsApp assemblé au chargement — le numéro n'apparaît pas dans le
   HTML afin d'échapper aux robots collecteurs de numéros. */
(function () {
  function setWaLinks() {
    try {
      var links = document.querySelectorAll(".wa-fab, .wa-inline");
      var num = ["3", "3", "6", "5", "2", "6", "7", "0", "4", "5", "7"].join("");
      var url = "https://wa.me/" + num + "?text=" + encodeURIComponent(document.documentElement.lang === "en" ? "Salam, I have a question about the NUR tablet" :
        document.documentElement.lang === "ar" ? "السلام عليكم، لدي سؤال عن لوحي NUR" :
        "Salam, j'ai une question sur la tablette NUR");
      for (var i = 0; i < links.length; i++) links[i].setAttribute("href", url);
    } catch (e) { /* silencieux */ }
  }
  setWaLinks();
  // Le bloc d'achat est injecté après coup : on repasse une fois la page chargée.
  window.addEventListener("load", setWaLinks);
  setTimeout(setWaLinks, 1500);
})();

/* Mesure d'audience maison — sans cookies, sans données personnelles. */
(function () {
  if (navigator.webdriver) return; // ignore les navigateurs automatisés
  // Auto-exclusion du propriétaire : posée automatiquement par stats.html.
  try { if (localStorage.getItem("nur_no_track")) return; } catch (e) {}

  // fetch + keepalive plutôt que sendBeacon : certains bloqueurs coupent
  // sendBeacon en bloc ; keepalive laisse la requête partir même à la fermeture.
  function send(t, n, r) {
    var corps = JSON.stringify(r ? { t: t, n: n, r: r } : { t: t, n: n });
    try {
      fetch("/api/visite", { method: "POST", body: corps, keepalive: true, headers: { "Content-Type": "text/plain" } })
        .catch(function () {});
    } catch (e) {
      try { navigator.sendBeacon("/api/visite", corps); } catch (e2) { /* silencieux */ }
    }
  }
  window.nurStat = send;

  // Page vue
  send("pv", location.pathname === "/" ? "/" : location.pathname, document.referrer || "");

  // Sections atteintes (une fois par visite)
  var sections = [
    ["#video", "vu:video"],
    [".features", "vu:tuiles"],
    ["#commander", "vu:achat"],
    ["#faq", "vu:faq"],
    [".vid-grid", "vu:videos-decouvrir"],
  ];
  if ("IntersectionObserver" in window) {
    sections.forEach(function (pair) {
      var el = document.querySelector(pair[0]);
      if (!el) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { send("ev", pair[1]); io.disconnect(); }
        });
      }, { threshold: 0.3 });
      io.observe(el);
    });
  }

  // Temps passé sur la page (tranches)
  var start = Date.now();
  var sent = false;
  addEventListener("pagehide", function () {
    if (sent) return;
    sent = true;
    var s = (Date.now() - start) / 1000;
    var bucket = s < 10 ? "moins de 10s" : s < 30 ? "10-30s" : s < 60 ? "30-60s" : s < 180 ? "1-3min" : "3min et plus";
    send("ev", "temps:" + bucket);
  });
})();
