import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/api";
import { courseCoverUrl } from "@/lib/cdn";

const QUOTE_COUNT = 5;

function fireCelebration() {
  const colors = ["#9fc65b", "#12352b", "#fbfaf4", "#d6f25c", "#2a5a4a"];
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  document.body.appendChild(canvas);

  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const defaults = { colors, disableForReducedMotion: true };

  shoot({
    ...defaults,
    particleCount: 160,
    spread: 86,
    startVelocity: 52,
    origin: { y: 0.38 },
  });

  const end = Date.now() + 2400;
  const frame = () => {
    shoot({
      ...defaults,
      particleCount: 5,
      angle: 60,
      spread: 62,
      origin: { x: 0, y: 0.7 },
    });
    shoot({
      ...defaults,
      particleCount: 5,
      angle: 120,
      spread: 62,
      origin: { x: 1, y: 0.7 },
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
      return;
    }
    window.setTimeout(() => {
      canvas.remove();
    }, 1200);
  };
  frame();
}

export interface CelebrationEnrollment {
  id: number;
  title: string;
  promise: string;
  slug: string;
  coverImageUrl: string | null;
  startsAt: string;
  venueName: string;
  city: string;
  amountCents: number;
  currency: string;
  cardLast4?: string | null;
}

export function PaymentCelebration({
  enrollment,
  locale,
  burstKey,
}: {
  enrollment?: CelebrationEnrollment | null;
  locale: string;
  /** Stable id so confetti survives Strict Mode / enrollment load. */
  burstKey: string;
}) {
  const { t } = useTranslation();
  const firedKey = useRef<string | null>(null);
  const quoteIndex = useMemo(() => Math.floor(Math.random() * QUOTE_COUNT) + 1, []);

  useEffect(() => {
    if (!burstKey || firedKey.current === burstKey) return;
    const prefersReduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      firedKey.current = burstKey;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (firedKey.current === burstKey) return;
      firedKey.current = burstKey;
      fireCelebration();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [burstKey]);

  const dateLabel = enrollment
    ? new Date(enrollment.startsAt).toLocaleString(locale.startsWith("en") ? "en-US" : "es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(159,198,91,0.28), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 80%, rgba(18,53,43,0.08), transparent 50%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] max-w-3xl flex-col justify-center px-5 py-12 md:min-h-[calc(100dvh-1px)] md:py-16">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-citrus/35 bg-ink text-paper shadow-[0_28px_70px_-20px_rgba(18,53,43,0.45)]">
          <div
            className="pointer-events-none absolute inset-0 rounded-[1.75rem] opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 10% 0%, rgba(159,198,91,0.32), transparent 55%), radial-gradient(ellipse 45% 35% at 100% 100%, rgba(214,242,92,0.14), transparent 50%)",
            }}
          />

          <div className="relative px-6 py-9 sm:px-10 sm:py-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-citrus/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-citrus ring-1 ring-citrus/30">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {t("account.celebrateEyebrow")}
            </div>

            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("account.celebrateTitle")}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-paper/70">{t("account.celebrateLead")}</p>

            {enrollment ? (
              <div className="mt-8 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
                  <div className="aspect-[4/3] bg-secondary sm:aspect-auto sm:min-h-full">
                    <img
                      src={courseCoverUrl(enrollment.slug, enrollment.coverImageUrl)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-citrus">
                      {enrollment.city}
                    </p>
                    <h2 className="font-display text-2xl font-semibold tracking-tight">{enrollment.title}</h2>
                    <p className="text-sm text-paper/65">{enrollment.promise}</p>
                    <p className="text-sm text-paper/80">{dateLabel}</p>
                    <p className="text-sm text-paper/55">
                      {enrollment.venueName} · {formatMoney(enrollment.amountCents, enrollment.currency)}
                      {enrollment.cardLast4 ? ` · ···· ${enrollment.cardLast4}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <blockquote className="mt-8 border-l-2 border-citrus pl-4">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-citrus">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {t("account.quoteLabel")}
              </p>
              <p className="mt-3 font-display text-xl font-medium leading-snug tracking-tight sm:text-2xl">
                “{t(`account.quotes.${quoteIndex}`)}”
              </p>
              <footer className="mt-3 text-xs uppercase tracking-[0.16em] text-paper/45">
                {t("account.quoteAttribution")}
              </footer>
            </blockquote>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/cuenta#mis-cursos"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-citrus px-6 text-sm font-semibold text-ink transition hover:brightness-105"
              >
                {t("account.celebrateViewCourses")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/cursos"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-sm font-semibold text-paper/85 transition hover:border-citrus/50 hover:text-citrus"
              >
                {t("account.celebrateBrowse")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
