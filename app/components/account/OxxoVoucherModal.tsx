import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { emailOxxoVoucher } from "@/store/slices/portalSlice";

export type OxxoVoucherInfo = {
  url: string;
  reference: string | null;
  expiresAt: number | null;
  amountCents: number;
  currency: string;
  courseTitle: string;
};

function formatExpiry(expiresAt: number | null, locale: string, fallback: string): string {
  if (!expiresAt) return fallback;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(expiresAt * 1000));
}

/** DOMINA-branded OXXO voucher sheet — email, open barcode, copy link. */
export function OxxoVoucherModal({
  open,
  onClose,
  enrollmentId,
  sessionId,
  voucher,
}: {
  open: boolean;
  onClose: () => void;
  enrollmentId: number;
  sessionId?: string | null;
  voucher: OxxoVoucherInfo | null;
}) {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const titleId = useId();
  const { oxxoEmailSending, oxxoEmailSent, oxxoEmailError } = useAppSelector((state) => state.portal);
  const [copied, setCopied] = useState(false);
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || !voucher) return null;

  const amount = formatMoney(voucher.amountCents, voucher.currency);
  const expiresLabel = formatExpiry(voucher.expiresAt, locale, t("pay.oxxoExpiresFallback"));

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-paper shadow-[0_28px_80px_rgba(18,53,43,0.35)] sm:rounded-2xl"
      >
        <div className="relative shrink-0 overflow-hidden bg-ink px-5 pb-6 pt-5 text-paper sm:px-6 sm:pt-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 0% 0%, rgba(214,242,92,0.28), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(255,255,255,0.08), transparent 50%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-citrus">OXXO · DOMINA</p>
              <h2 id={titleId} className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-[1.65rem]">
                {t("pay.oxxoModalTitle")}
              </h2>
              <p className="mt-1.5 text-sm text-paper/70">{t("pay.oxxoModalLead")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-paper/70 transition hover:bg-white/10 hover:text-paper"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="relative mt-5 font-display text-4xl font-semibold tracking-tight text-citrus sm:text-5xl">
            {amount}
          </p>
          {voucher.courseTitle ? (
            <p className="relative mt-2 truncate text-sm font-medium text-paper/80">{voucher.courseTitle}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {voucher.reference ? (
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {t("pay.oxxoReference")}
              </p>
              <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-ink">{voucher.reference}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {t("pay.oxxoExpires")}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{expiresLabel}</p>
          </div>

          <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
              {t("pay.oxxoStep1")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
              {t("pay.oxxoStep2")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
              {t("pay.oxxoStep3")}
            </li>
          </ol>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border bg-card/80 px-5 py-4 sm:px-6">
          <Button
            type="button"
            className="h-12 w-full text-base"
            disabled={oxxoEmailSending}
            onClick={() => {
              void dispatch(
                emailOxxoVoucher({
                  enrollmentId,
                  ...(sessionId ? { sessionId } : {}),
                }),
              );
            }}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {oxxoEmailSending
              ? t("common.loading")
              : oxxoEmailSent
                ? t("pay.oxxoEmailResend")
                : t("pay.oxxoEmailSend")}
          </Button>
          {oxxoEmailSent ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-primary">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {t("pay.oxxoEmailSent")}
            </p>
          ) : null}
          {oxxoEmailError ? <p className="text-center text-xs text-destructive">{oxxoEmailError}</p> : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => window.open(voucher.url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("pay.oxxoOpenBarcode")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(voucher.url);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  window.open(voucher.url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? t("pay.oxxoLinkCopied") : t("pay.oxxoCopyLink")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
