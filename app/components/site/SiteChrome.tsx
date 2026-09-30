import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { HeaderAccountChip } from "@/components/site/HeaderAccountChip";

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`font-display text-lg font-semibold tracking-tight ${light ? "text-paper" : "text-ink"}`}>
      DOMINA
    </span>
  );
}

export function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-3">
          <Wordmark />
          <span className="hidden text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            {t("common.tagline")}
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <NavLink to="/cursos" className="text-sm font-medium text-foreground/80 hover:text-foreground">
            {t("nav.courses")}
          </NavLink>
          <LanguageSwitcher compact />
          <HeaderAccountChip className="!no-underline" />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("footer.note")}</p>
        </div>
        <div className="flex gap-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Link to="/acceso/equipo" className="hover:text-ink">
            {t("footer.staff")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
