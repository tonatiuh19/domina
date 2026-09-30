import type { AppLanguage } from "@shared/api";

export const APP_LANGUAGES = ["es", "en"] as const;
export const LANGUAGE_STORAGE_KEY = "domina.language";

/** Map browser/BCP-47 tags onto the two app catalogs. */
export function normalizeAppLanguage(input: string | null | undefined): AppLanguage | null {
  if (!input?.trim()) return null;
  const lower = input.trim().toLowerCase().replace("_", "-");
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "es" || lower.startsWith("es-")) return "es";
  return null;
}

export function resolveAppLanguage(input: string | null | undefined, fallback: AppLanguage = "es"): AppLanguage {
  return normalizeAppLanguage(input) || fallback;
}

export function readStoredLanguage(): AppLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeAppLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    // Keep legacy i18next key in sync if anything else reads it.
    window.localStorage.setItem("i18nextLng", language);
  } catch {
    // ignore private-mode storage failures
  }
}

export function applyDocumentLanguage(language: AppLanguage) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "en" ? "en" : "es-MX";
}
