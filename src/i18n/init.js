import { dict, DEFAULT_LANG } from "./dict";
import { resolveLanguage } from "./language";

function applyLanguage(lang) {
  const strings = dict[lang] ?? dict[DEFAULT_LANG];

  document.documentElement.lang = lang;
  document.documentElement.classList.toggle("lang-en", lang === "en");
  document.documentElement.classList.toggle("lang-es", lang !== "en");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && key in strings) el.textContent = strings[key];
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
