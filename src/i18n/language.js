import { DEFAULT_LANG } from "./dict";

export function resolveLanguage() {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const langs =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  const primary = String(langs[0] || "").toLowerCase();
  if (primary.startsWith("es")) return "es";
  if (primary.startsWith("en")) return "en";
  return DEFAULT_LANG;
}