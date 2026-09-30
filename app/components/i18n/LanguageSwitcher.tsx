import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@shared/api";
import { useSetAppLanguage } from "@/components/i18n/LanguageSync";
import { resolveAppLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetAppLanguage();
  const current = resolveAppLanguage(i18n.language);
  const next: AppLanguage = current === "en" ? "es" : "en";
  const currentLabel = current === "en" ? t("common.langEn") : t("common.langEs");
  const nextLabel = next === "en" ? t("common.langEn") : t("common.langEs");

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground",
        className,
      )}
      onClick={() => void setLanguage(next)}
      aria-label={t("common.languageSwitch", { current: currentLabel, next: nextLabel })}
      title={t("common.languageSwitch", { current: currentLabel, next: nextLabel })}
    >
      {compact ? (
        <>
          <span className={cn(current === "es" ? "text-inherit opacity-100" : "opacity-35")}>ES</span>
          <span className="opacity-25" aria-hidden>
            /
          </span>
          <span className={cn(current === "en" ? "text-inherit opacity-100" : "opacity-35")}>EN</span>
        </>
      ) : (
        <>
          {t("common.language")} · {current.toUpperCase()}
        </>
      )}
    </button>
  );
}
