import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import es from "./locales/es/translation.json";
import en from "./locales/en/translation.json";
import {
  applyDocumentLanguage,
  LANGUAGE_STORAGE_KEY,
  normalizeAppLanguage,
  resolveAppLanguage,
  writeStoredLanguage,
} from "./lib/language";

// Migrate legacy i18next key into the DOMINA key once.
if (typeof window !== "undefined") {
  try {
    if (!window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) {
      const legacy = normalizeAppLanguage(window.localStorage.getItem("i18nextLng"));
      if (legacy) writeStoredLanguage(legacy);
    }
  } catch {
    // ignore
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es }, en: { translation: en } },
    // Do not set `lng` — detector chooses (storage → browser → fallback).
    fallbackLng: "es",
    supportedLngs: ["es", "en"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    initImmediate: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      convertDetectedLanguage: (lng) => resolveAppLanguage(lng, "es"),
    },
  })
  .then(() => {
    const language = resolveAppLanguage(i18n.language);
    writeStoredLanguage(language);
    applyDocumentLanguage(language);
  });

export default i18n;
