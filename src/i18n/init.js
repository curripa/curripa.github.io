import { dict, DEFAULT_LANG } from "./dict";
import { resolveLanguage } from "./language";

function applyLanguage(lang) {
  const strings = dict[lang] ?? dict[DEFAULT_LANG];

  document.documentElement.lang = lang;
  document.documentElement.classList.toggle("lang-en", lang === "en");
  document.documentElement.classList.toggle("lang-es", lang !== "en");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key || !(key in strings)) return;
    let text = strings[key];
    const raw = el.getAttribute("data-i18n-params");
    if (raw) {
      try {
        const params = JSON.parse(raw);
        if (key === "footer.stats") {
          const a = Number(params.albums);
          const s = Number(params.songs);
          params.albumLabel = strings[a === 1 ? "footer.album.one" : "footer.album.other"] ?? "";
          params.songLabel = strings[s === 1 ? "footer.song.one" : "footer.song.other"] ?? "";
        }
        for (const [k, v] of Object.entries(params)) {
          text = text.replaceAll(`{{${k}}}`, String(v));
        }
      } catch {}
    }
    el.textContent = text;
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key && key in strings) el.setAttribute("aria-label", strings[key]);
  });

  if (strings["layout.title"]) document.title = strings["layout.title"];
  const description = document.querySelector('meta[name="description"]');
  if (description && strings["layout.description"]) {
    description.setAttribute("content", strings["layout.description"]);
  }
}

applyLanguage(resolveLanguage());
