import { DOMINA_CDN_IMAGES } from "@/lib/cdn";

/** Absolute public origin for canonical / Open Graph URLs (no trailing slash). */
export function publicSiteOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://localhost:8080";
}

/** Join origin + path into an absolute URL. */
export function absoluteSiteUrl(path = "/"): string {
  const origin = publicSiteOrigin();
  if (!path || path === "/") return `${origin}/`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

/** Default share image (hero) when a page has no cover. */
export function defaultOgImage(): string {
  return DOMINA_CDN_IMAGES.hero;
}
