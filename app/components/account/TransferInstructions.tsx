import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/api";
import type { TransferInstructionsPayload } from "@/store/slices/portalSlice";

function formatExpiry(expiresAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(expiresAt));
}

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-border py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className={`mt-1 break-all text-sm font-semibold text-ink ${mono ? "font-mono tracking-wide" : ""}`}>
          {value}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-9 shrink-0 gap-1.5 px-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            // ignore
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? t("pay.transferCopied") : t("common.copy")}
      </Button>
    </div>
  );
}

/** SPEI bank details + concepto legend for a pending transfer. */
export function TransferInstructions({
  transfer,
  onSwitchMethod,
}: {
  transfer: TransferInstructionsPayload;
  onSwitchMethod?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";
  const amount = formatMoney(transfer.amountCents, transfer.currency);
  const expiresLabel = formatExpiry(transfer.expiresAt, locale);

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-citrus/40 bg-citrus/15 px-5 py-4 text-sm leading-6 text-ink">
        <p className="font-semibold">{t("pay.transferPendingTitle")}</p>
        <p className="mt-1.5 text-ink/80">{t("pay.transferPendingBody")}</p>
        <p className="mt-2 text-xs text-ink/65">{t("pay.transferExpires", { date: expiresLabel })}</p>
      </div>

      <div className="rounded-xl border border-border bg-paper px-4 py-1 sm:px-5">
        <CopyRow label={t("pay.transferBank")} value={transfer.bank.bankName} />
        <CopyRow label={t("pay.transferHolder")} value={transfer.bank.accountHolder} />
        <CopyRow label={t("pay.transferClabe")} value={transfer.bank.clabe} mono />
        {transfer.bank.accountNumber ? (
          <CopyRow label={t("pay.transferAccount")} value={transfer.bank.accountNumber} mono />
        ) : null}
        <CopyRow label={t("pay.transferAmount")} value={amount} />
        <CopyRow label={t("pay.transferConcept")} value={transfer.reference} mono />
      </div>

      <div className="rounded-xl border border-border bg-card/80 px-5 py-4 text-sm leading-6 text-muted-foreground">
        <p className="font-semibold text-ink">{t("pay.transferConceptLegend")}</p>
        <p className="mt-1.5">
          {t("pay.transferConceptBody", { reference: transfer.reference })}
        </p>
        {transfer.bank.instructions ? (
          <p className="mt-3 break-words text-ink/80">{transfer.bank.instructions}</p>
        ) : null}
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>{t("pay.transferStep1")}</li>
          <li>{t("pay.transferStep2", { reference: transfer.reference })}</li>
          <li>{t("pay.transferStep3")}</li>
        </ol>
      </div>

      {onSwitchMethod ? (
        <Button type="button" variant="outline" className="h-11 w-full" onClick={onSwitchMethod}>
          {t("pay.transferSwitchMethod")}
        </Button>
      ) : null}
    </div>
  );
}
