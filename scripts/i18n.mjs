// Site multilingue : les pages françaises de public/ sont la source, ce script
// génère public/en/ et public/ar/ à partir des dictionnaires i18n/<lang>/<page>.json.
//
//   node scripts/i18n.mjs extract   → i18n/fr/<page>.json : les segments à traduire
//   node scripts/i18n.mjs build     → public/en/*.html et public/ar/*.html
//
// Un segment = le contenu d'un élément qui porte du texte et dont les enfants sont
// tous des balises de mise en forme (strong, a, em…). Sinon, chaque nœud texte est
// un segment à part. Les attributs alt, title, placeholder, aria-label, content
// (meta description) et <title> sont aussi des segments. La clé est le texte
// français normalisé ; une clé absente du dictionnaire reste en français et est
// signalée à la construction.
import { load } from "cheerio";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RACINE, "public");
const I18N = join(RACINE, "i18n");
const PAGES = ["index", "decouvrir", "aide", "nouveautes", "cgv", "mentions-legales", "success", "cancel"];
const LANGUES = { en: { dir: "ltr", locale: "en" }, ar: { dir: "rtl", locale: "ar" } };
const SITE = "https://nur-store.com";
const INLINE = new Set(["strong", "b", "em", "i", "a", "span", "small", "br", "code", "sup", "sub", "u", "mark", "abbr", "time"]);
const ATTRS = ["alt", "title", "placeholder", "aria-label"];
const RESSOURCES = /^(assets\/|styles\.css|main\.js|boutique\.js|videos\.js|lang\.js|products\.json)/;

const norm = (s) => s.replace(/\s+/g, " ").trim();
const aDesLettres = (s) => /[A-Za-zÀ-ÿ]/.test(s);

// Parcourt le document et appelle `sur(cle, poser)` pour chaque segment ;
// `poser(traduction)` remplace le segment dans le document.
function segments($, sur) {
  const visiter = (el) => {
    const nom = el.tagName && el.tagName.toLowerCase();
    if (!nom || nom === "script" || nom === "style" || nom === "noscript" || nom === "svg") return;
    if (el.attribs && (el.attribs["data-i18n-skip"] !== undefined || el.attribs.lang === "ar")) return;
    for (const a of ATTRS) {
      const v = el.attribs && el.attribs[a];
      if (v && aDesLettres(v)) sur(norm(v), (t) => { el.attribs[a] = t; });
    }
    if (nom === "meta" && /^(description|og:description|og:title)$/.test(el.attribs.name || el.attribs.property || "") && el.attribs.content) {
      sur(norm(el.attribs.content), (t) => { el.attribs.content = t; });
    }
    const enfants = el.children || [];
    const textes = enfants.filter((n) => n.type === "text" && norm(n.data));
    const balises = enfants.filter((n) => n.type === "tag");
    const toutInline = balises.every((n) => INLINE.has(n.tagName.toLowerCase()) && !n.children.some((c) => c.type === "tag" && !INLINE.has(c.tagName.toLowerCase())));
    if (nom === "title" || (textes.length && toutInline && balises.length)) {
      const html = norm($(el).html());
      if (aDesLettres(html)) sur(html, (t) => { $(el).html(t); });
      return;
    }
    for (const n of textes) {
      const cle = norm(n.data);
      if (aDesLettres(cle)) sur(cle, (t) => {
        const [, avant, , apres] = n.data.match(/^(\s*)([\s\S]*?)(\s*)$/);
        n.data = avant + t + apres;
      });
    }
    for (const n of balises) visiter(n);
  };
  $("html").each((_, el) => visiter(el));
}

// Chaînes littérales des scripts en ligne (messages d'erreur, libellés) : clés
// « @script » du dictionnaire, remplacées telles quelles dans le code.
function chainesScript(html) {
  const out = new Set();
  for (const m of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const s of m[1].matchAll(/"([^"\\\n]{6,})"/g)) {
      if (/[a-zéèêàç]{3,} /i.test(s[1]) && /^[^()=;{}$<>]+$/.test(s[1])) out.add(s[1]);
    }
  }
  return [...out];
}

function extract() {
  mkdirSync(join(I18N, "fr"), { recursive: true });
  let total = 0;
  for (const page of PAGES) {
    const html = readFileSync(join(PUBLIC, page + ".html"), "utf8");
    const $ = load(html);
    const cles = {};
    segments($, (cle) => { cles[cle] = ""; });
    const script = chainesScript(html);
    if (script.length) cles["@script"] = Object.fromEntries(script.map((s) => [s, ""]));
    writeFileSync(join(I18N, "fr", page + ".json"), JSON.stringify(cles, null, 1) + "\n");
    const n = Object.keys(cles).length;
    const mots = Object.keys(cles).join(" ").split(/\s+/).length;
    total += mots;
    console.log(`${page.padEnd(18)} ${String(n).padStart(4)} segments ${String(mots).padStart(6)} mots`);
  }
  console.log("total ≈", total, "mots");
}

function dictionnaire(lang, page) {
  const lire = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
  const commun = lire(join(I18N, lang, "commun.json"));
  const propre = lire(join(I18N, lang, page + ".json"));
  return { ...commun, ...propre, "@script": { ...(commun["@script"] || {}), ...(propre["@script"] || {}) } };
}

function liensAlternates(page) {
  const chemin = page === "index" ? "" : page + ".html";
  return [
    `<link rel="alternate" hreflang="fr" href="${SITE}/${chemin}" />`,
    `<link rel="alternate" hreflang="en" href="${SITE}/en/${chemin}" />`,
    `<link rel="alternate" hreflang="ar" href="${SITE}/ar/${chemin}" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}/${chemin}" />`,
  ].join("\n  ");
}

function build() {
  let manquants = 0;
  for (const lang of Object.keys(LANGUES)) {
    mkdirSync(join(PUBLIC, lang), { recursive: true });
    for (const page of PAGES) {
      let html = readFileSync(join(PUBLIC, page + ".html"), "utf8");
      const dico = dictionnaire(lang, page);
      // scripts en ligne d'abord, sur le texte brut
      for (const [k, v] of Object.entries(dico["@script"] || {})) if (v) html = html.split(`"${k}"`).join(`"${v}"`);
      const $ = load(html, { decodeEntities: false });
      const absents = [];
      segments($, (cle, poser) => {
        const t = dico[cle];
        if (t) poser(t); else absents.push(cle);
      });
      $("html").attr("lang", lang).attr("dir", LANGUES[lang].dir);
      // ressources partagées : chemins absolus depuis le sous-dossier
      $("[src],[href]").each((_, el) => {
        for (const a of ["src", "href"]) {
          const v = el.attribs[a];
          if (!v) continue;
          if (RESSOURCES.test(v)) el.attribs[a] = "/" + v;
          else if (v === "/") el.attribs[a] = `/${lang}/`;
        }
      });
      // la vidéo d'accueil existe dans la langue de la page (voix Abdel en anglais et en arabe)
      const VIDEO_ACCUEIL = { en: "a0Woj2DmCaY", ar: "sl03FkZzZYY" };
      $('iframe[src*="embed/xcfn68nsPyk"]').attr("src", "https://www.youtube.com/embed/" + VIDEO_ACCUEIL[lang]);
      $('link[rel="alternate"]').remove();
      $("head").append("\n  " + liensAlternates(page) + "\n");
      if (lang === "ar") {
        $("head").append('\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" />\n');
      }
      writeFileSync(join(PUBLIC, lang, page + ".html"), $.html());
      if (absents.length) {
        manquants += absents.length;
        console.log(`${lang}/${page}: ${absents.length} segment(s) sans traduction`);
        for (const a of absents.slice(0, 5)) console.log("   · " + a.slice(0, 90));
      }
    }
  }
  console.log(manquants ? `⚠ ${manquants} segment(s) restés en français` : "✓ toutes les pages traduites");
}

const cmd = process.argv[2];
if (cmd === "extract") extract();
else if (cmd === "build") build();
else { console.log("usage : node scripts/i18n.mjs extract | build"); process.exit(1); }
