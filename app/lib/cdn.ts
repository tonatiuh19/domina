import { normalizeCdnUploadUrl } from "@shared/cdnUrl";

/** Course and hero images hosted on Disrupting Labs CDN (same stack as athlete-hub). */
export const DOMINA_CDN_IMAGES = {
  hero: "https://disruptinglabs.com/data/api/data/domina/hero/main_image/6abc7f428c207_1790738242.jpg",
  "mecanica-basica-para-mujeres":
    "https://disruptinglabs.com/data/api/data/domina/mecanica-basica-para-mujeres/main_image/6abc7f373fa5d_1790738231.jpg",
  "power-bi-practico":
    "https://disruptinglabs.com/data/api/data/domina/power-bi-practico/main_image/6abc7f39043a6_1790738233.jpg",
  "testing-de-software":
    "https://disruptinglabs.com/data/api/data/domina/testing-de-software/main_image/6abc7f3aa6760_1790738234.jpg",
  "ia-para-el-trabajo":
    "https://disruptinglabs.com/data/api/data/domina/ia-para-el-trabajo/main_image/6abc7f3ce8a73_1790738236.jpg",
  "soldadura-mig":
    "https://disruptinglabs.com/data/api/data/domina/soldadura-mig/main_image/6abc7f3e9da69_1790738238.jpg",
  "comunicacion-profesional":
    "https://disruptinglabs.com/data/api/data/domina/comunicacion-profesional/main_image/6abc7f406c826_1790738240.jpg",
} as const;

export function courseCoverUrl(slug: string, stored?: string | null): string {
  const fromDb = normalizeCdnUploadUrl(stored);
  if (fromDb) return fromDb;
  const fallback = DOMINA_CDN_IMAGES[slug as keyof typeof DOMINA_CDN_IMAGES];
  return fallback || DOMINA_CDN_IMAGES.hero;
}
