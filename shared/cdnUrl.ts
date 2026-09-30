/** Disrupting Labs CDN URL helpers — shared by client display. */

const STATIC_CDN_PREFIXES = [
  "/data/domina/assets/",
  "/data/athlete-hub/assets/",
  "/data/triboo/assets/",
  "/data/optimum/assets/",
];

const UPLOADED_CDN_PATH =
  /^https:\/\/disruptinglabs\.com\/data\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/(main_image|images|files|pdfs)\//;

export const CDN_UPLOAD_PUBLIC_BASE = "https://disruptinglabs.com/data/api";
export const DOMINA_CDN_FOLDER = "domina";

/**
 * Fix legacy CDN upload URLs missing the /data/api prefix.
 * Without it, Apache serves SPA HTML and <img> requests fail.
 */
export function normalizeCdnUploadUrl(url: string): string;
export function normalizeCdnUploadUrl(url: string | null | undefined): string | null;
export function normalizeCdnUploadUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.includes("disruptinglabs.com/data/")) return trimmed;
  if (trimmed.includes("disruptinglabs.com/data/api/")) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (STATIC_CDN_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) {
      return trimmed;
    }
    if (UPLOADED_CDN_PATH.test(trimmed)) {
      return trimmed.replace(
        "disruptinglabs.com/data/",
        "disruptinglabs.com/data/api/data/",
      );
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function buildCdnPublicUrl(relativePath: string): string {
  if (relativePath.startsWith("http")) {
    return normalizeCdnUploadUrl(relativePath) || relativePath;
  }
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${CDN_UPLOAD_PUBLIC_BASE}${path}`;
}
