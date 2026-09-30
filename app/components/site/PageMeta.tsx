import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import type { Course } from "@shared/api";
import { APP_TITLE } from "@/lib/app-config";
import { courseCoverUrl } from "@/lib/cdn";
import { absoluteSiteUrl, defaultOgImage, publicSiteOrigin } from "@/lib/siteUrl";
import { resolveAppLanguage } from "@/lib/language";

export type PageMetaProps = {
  /** Page title segment (joined as `{{page}} · DOMINA`). Omit for the site default title. */
  title?: string;
  /** When true, `title` is used as the full document title (home hero). */
  titleAbsolute?: boolean;
  description?: string;
  /** Site-relative path for canonical + og:url (e.g. `/cursos/power-bi-practico`). */
  path?: string;
  /** Absolute HTTPS image URL for OG/Twitter. */
  image?: string | null;
  imageAlt?: string;
  /** Default indexes public pages; private surfaces should pass noindex. */
  robots?: string;
  type?: "website" | "article" | "product";
  /** Optional JSON-LD object (Course, Organization, …). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
  /** Prefer keywords for public marketing pages only. */
  keywords?: string;
};

function clampText(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function toAbsoluteImage(url: string | null | undefined): string {
  const raw = (url || "").trim();
  if (!raw) return defaultOgImage();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return absoluteSiteUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

/**
 * Site-wide document head: title, description, canonical, Open Graph, Twitter,
 * theme-color, and optional JSON-LD. Drop on every route; private apps pass robots=noindex.
 */
export function PageMeta({
  title,
  titleAbsolute = false,
  description,
  path,
  image,
  imageAlt,
  robots,
  type = "website",
  jsonLd,
  keywords,
}: PageMetaProps) {
  const { t, i18n } = useTranslation();
  const lang = resolveAppLanguage(i18n.language) || "es";
  const locale = lang === "en" ? "en_US" : "es_MX";
  const altLocale = lang === "en" ? "es_MX" : "en_US";

  const documentTitle = titleAbsolute
    ? clampText(title || t("seo.defaultTitle"), 70)
    : title?.trim()
      ? clampText(t("seo.pageTitle", { page: title.trim(), app: APP_TITLE }), 70)
      : clampText(t("seo.defaultTitle"), 70);

  const metaDescription = clampText(description?.trim() || t("seo.defaultDescription"), 160);
  const canonical = path != null ? absoluteSiteUrl(path) : undefined;
  const ogImage = toAbsoluteImage(image);
  const ogImageAlt = clampText(imageAlt?.trim() || title || APP_TITLE, 120);
  const origin = publicSiteOrigin();

  const structured =
    jsonLd == null
      ? null
      : Array.isArray(jsonLd)
        ? jsonLd
        : [jsonLd];

  return (
    <Helmet prioritizeSeoTags>
      <html lang={lang} />
      <title>{documentTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      <meta name="theme-color" content="#12352b" />
      <meta name="application-name" content={APP_TITLE} />
      <meta name="apple-mobile-web-app-title" content={APP_TITLE} />
      {robots ? <meta name="robots" content={robots} /> : <meta name="robots" content="index, follow" />}
      {canonical ? <link rel="canonical" href={canonical} /> : null}

      <meta property="og:site_name" content={APP_TITLE} />
      <meta property="og:title" content={documentTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:locale" content={locale} />
      <meta property="og:locale:alternate" content={altLocale} />
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={documentTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={ogImageAlt} />

      <link rel="icon" href={`${origin}/favicon.svg`} type="image/svg+xml" />

      {structured?.map((entry, index) => (
        <script key={`ld-${index}`} type="application/ld+json">
          {JSON.stringify(entry)}
        </script>
      ))}
    </Helmet>
  );
}

/** Build PageMeta props + Course JSON-LD for `/cursos/:slug`. */
export function coursePageMeta(course: Course): PageMetaProps {
  const image = courseCoverUrl(course.slug, course.coverImageUrl);
  const description = course.promise?.trim() || course.summary?.trim() || undefined;
  const path = `/cursos/${course.slug}`;
  const url = absoluteSiteUrl(path);

  const offers =
    course.priceCents != null
      ? {
          "@type": "Offer",
          priceCurrency: course.currency || "MXN",
          price: (course.priceCents / 100).toFixed(2),
          availability: "https://schema.org/InStock",
          url,
        }
      : undefined;

  return {
    title: course.title,
    description,
    path,
    image,
    imageAlt: course.title,
    type: "website",
    keywords: [course.categoryLabel || course.category, course.city, "DOMINA", "taller", "Guadalajara"]
      .filter(Boolean)
      .join(", "),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Course",
      name: course.title,
      description: description || course.summary,
      provider: {
        "@type": "Organization",
        name: APP_TITLE,
        url: absoluteSiteUrl("/"),
      },
      image,
      url,
      ...(course.city ? { location: { "@type": "Place", name: course.city } } : {}),
      ...(offers ? { offers } : {}),
    },
  };
}

/** Organization + WebSite JSON-LD for the marketing home. */
export function homeJsonLd(): Record<string, unknown>[] {
  const origin = absoluteSiteUrl("/");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: APP_TITLE,
      url: origin,
      logo: absoluteSiteUrl("/favicon.svg"),
      sameAs: [],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: APP_TITLE,
      url: origin,
      potentialAction: {
        "@type": "SearchAction",
        target: `${absoluteSiteUrl("/cursos")}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
