// Vidéos de fonctions (Découvrir + Aide). Un seul endroit à modifier quand une vidéo
// est mise en ligne : remplacer null par l'identifiant YouTube (la partie après v=).
// Tant que l'identifiant est null, la page montre un emplacement « bientôt ».
(function () {
  var VIDEOS = {
    v1: { id: "tczY2r-ECFI", titre: "NUR — Les lettres de l'arabe" },
    v2: { id: "-U3-YJpXBxA", titre: "NUR — La taille du texte" },
    v3: { id: "aOOwfRyT4gA", titre: "NUR — Les horaires de ton pays" },
    v4: { id: "HwmXp80WMRo", titre: "NUR — L'adhan" },
    v5: { id: "SttRyi-Y94g", titre: "NUR — Le Coran, sans connexion" },
    v6: { id: "AhGFKqjdkqA", titre: "NUR — La bibliothèque de hadiths" }
  };

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
      el.textContent = "Vidéo bientôt disponible";
    }
  }
})();
