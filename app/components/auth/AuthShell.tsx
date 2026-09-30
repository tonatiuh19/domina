import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { AuthBrandPanel, type AuthStat, type AuthTestimonial } from "@/components/auth/AuthBrandPanel";
import { PageMeta } from "@/components/site/PageMeta";

export function AuthShell({
  headline,
  subheadline,
  stats,
  testimonials,
  footerNote,
  imageUrl,
  metaTitle,
  metaDescription,
  metaPath,
  children,
}: {
  headline: ReactNode;
  subheadline: string;
  stats: AuthStat[];
  testimonials: AuthTestimonial[];
  footerNote?: string;
  imageUrl: string;
  metaTitle: string;
  metaDescription?: string;
  metaPath?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background">
      <PageMeta
        title={metaTitle}
        description={metaDescription || t("seo.authUserDescription")}
        path={metaPath}
        robots="noindex, nofollow"
      />
      <div className="flex min-h-0 w-full max-w-full flex-col overflow-y-auto border-border/50 lg:max-w-[460px] lg:border-r">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-5 backdrop-blur-md sm:px-7">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight text-ink">
            DOMINA
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact className="text-muted-foreground hover:text-ink" />
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {t("common.back")}
            </Link>
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center px-6 py-8 sm:px-9">
          <div className="mx-auto w-full max-w-[340px] motion-safe:animate-[domina-fade-up_0.4s_ease-out]">
            {children}
          </div>
        </div>
      </div>

      <AuthBrandPanel
        headline={headline}
        subheadline={subheadline}
        stats={stats}
        testimonials={testimonials}
        footerNote={footerNote}
        imageUrl={imageUrl}
      />
    </div>
  );
}
