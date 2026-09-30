import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { HeaderAccountChip } from "@/components/site/HeaderAccountChip";

export function MarketingFrame({
  children,
  onCategory,
}: {
  children: ReactNode;
  onCategory?: (category: "DOMINA TECH" | "DOMINA MAKER" | "DOMINA SKILLS") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="domina-site">
      <header className="domina-header">
        <Link className="domina-wordmark" to="/" aria-label={t("home.wordmarkHome")}>
          DOMINA
        </Link>
        <div className="domina-header-actions">
          <LanguageSwitcher compact className="domina-lang-switch" />
          <HeaderAccountChip />
          <Link className="domina-header-cta" to="/cursos">
            {t("home.cta")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="domina-footer" id="enseña">
        <div className="domina-footer-main">
          <div className="domina-footer-brand">
            <Link className="domina-wordmark" to="/">
              DOMINA
            </Link>
            <p>{t("common.tagline").toUpperCase()}</p>
            <span>{t("footer.note")}</span>
          </div>
          <div className="domina-footer-column">
            <h2>{t("nav.courses")}</h2>
            <a href="/#cursos" onClick={() => onCategory?.("DOMINA TECH")}>
              DOMINA TECH <span>↗</span>
            </a>
            <a href="/#cursos" onClick={() => onCategory?.("DOMINA MAKER")}>
              DOMINA MAKER <span>↗</span>
            </a>
            <a href="/#cursos" onClick={() => onCategory?.("DOMINA SKILLS")}>
              DOMINA SKILLS <span>↗</span>
            </a>
          </div>
          <div className="domina-footer-column">
            <h2>{t("nav.companies")}</h2>
            <a href="/#empresas">
              DOMINA for Business <span>↗</span>
            </a>
            <Link to="/acceso/equipo">
              {t("footer.staff")} <span>↗</span>
            </Link>
            <Link to="/legal/terminos">
              {t("footer.terms")} <span>↗</span>
            </Link>
            <Link to="/legal/privacidad">
              {t("footer.privacy")} <span>↗</span>
            </Link>
            <span>Guadalajara + Zapopan, MX</span>
            <LanguageSwitcher className="mt-3 text-left" />
          </div>
          <a className="domina-footer-backtop" href="/#inicio" aria-label={t("common.back")}>
            ↑
          </a>
        </div>
        <div className="domina-footer-bottom">
          <span>© {new Date().getFullYear()} DOMINA</span>
          <span>{t("common.tagline").toUpperCase()}</span>
          <a href="/#inicio">{t("common.back")} ↑</a>
        </div>
      </footer>
    </div>
  );
}
