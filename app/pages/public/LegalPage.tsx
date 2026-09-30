import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MarketingFrame } from "@/pages/public/MarketingChrome";
import { MarkdownBody } from "@/components/site/MarkdownBody";
import { PageMeta } from "@/components/site/PageMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAppLanguage } from "@/lib/language";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchSitePage } from "@/store/slices/siteSlice";

export function LegalPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { page, loading, error } = useAppSelector((state) => state.site);
  const lang = resolveAppLanguage(i18n.language) || "es";

  useEffect(() => {
    if (!slug) return;
    void dispatch(fetchSitePage({ slug, lang }));
  }, [dispatch, lang, slug]);

  return (
    <MarketingFrame>
      <PageMeta
        title={page?.title || t("common.appName")}
        description={t("seo.defaultDescription")}
        path={slug ? `/legal/${slug}` : undefined}
      />
      <section className="mx-auto max-w-3xl px-5 py-12 lg:py-16">
        <Link to="/" className="text-sm font-medium text-muted-foreground transition hover:text-ink">
          ← {t("common.back")}
        </Link>
        {loading ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : null}
        {error ? <p className="mt-8 text-sm text-destructive">{error}</p> : null}
        {!loading && page ? (
          <article className="mt-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
            <div className="mt-6">
              <MarkdownBody markdown={page.bodyMd} />
            </div>
          </article>
        ) : null}
      </section>
    </MarketingFrame>
  );
}
