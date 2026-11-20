// Vidéos de fonctions (Découvrir + Aide). Un seul endroit à modifier quand une vidéo
// est mise en ligne : remplacer null par l'identifiant YouTube (la partie après v=).
// Tant que l'identifiant est null, la page montre un emplacement « bientôt ».
(function () {
  var L = document.documentElement.lang === "en" ? "en" : document.documentElement.lang === "ar" ? "ar" : "fr";
  var T = {
    v1: { id: "tczY2r-ECFI", fr: "NUR — Les lettres de l'arabe", en: "NUR — The Arabic letters", ar: "NUR — حروف العربية" },
    v2: { id: "-U3-YJpXBxA", fr: "NUR — La taille du texte", en: "NUR — Text size", ar: "NUR — حجم النص" },
    v3: { id: "aOOwfRyT4gA", fr: "NUR — Les horaires de ton pays", en: "NUR — Prayer times for your country", ar: "NUR — مواقيت بلدك" },
    v4: { id: "HwmXp80WMRo", fr: "NUR — L'adhan", en: "NUR — The adhan", ar: "NUR — الأذان" },
    v5: { id: "SttRyi-Y94g", fr: "NUR — Le Coran, sans connexion", en: "NUR — The Quran, offline", ar: "NUR — القرآن بدون اتصال" },
    v6: { id: "AhGFKqjdkqA", fr: "NUR — La bibliothèque de hadiths", en: "NUR — The hadith library", ar: "NUR — مكتبة الحديث" }
  };
  var VIDEOS = {};
  for (var k in T) VIDEOS[k] = { id: T[k].id, titre: T[k][L] };
  var BIENTOT = { fr: "Vidéo bientôt disponible", en: "Video coming soon", ar: "الفيديو متاح قريباً" }[L];

  var blocs = document.querySelectorAll("[data-video]");
  for (var i = 0; i < blocs.length; i++) {
    var el = blocs[i];
    var v = VIDEOS[el.getAttribute("data-video")];
    if (v && v.id) {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube.com/embed/" + v.id;
      f.title = v.titre;
      f.loading = "lazy";
      f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
      f.setAttribute("allowfullscreen", "");
      el.className = "video-frame";
      el.innerHTML = "";
      el.appendChild(f);
    } else {
      el.className = "vid-soon";
      el.textContent = BIENTOT;
    }
  }
})();
