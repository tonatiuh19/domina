import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { loadStripe } from "@stripe/stripe-js";
import { CheckoutProvider, PaymentElement, useCheckout } from "@stripe/react-stripe-js/checkout";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccountHomeSkeleton, AccountPaySkeleton } from "@/components/ui/skeleton";
import { PaymentCelebration } from "@/components/account/PaymentCelebration";
import { OxxoVoucherModal } from "@/components/account/OxxoVoucherModal";
import { TransferInstructions } from "@/components/account/TransferInstructions";
import { StarRating } from "@/components/account/StarRating";
import { ClientShell } from "@/pages/client/ClientLayout";
import { formatMoney } from "@/lib/api";
import { courseCoverUrl } from "@/lib/cdn";
import { resolveAppLanguage } from "@/lib/language";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUserMe, updateUserProfile } from "@/store/slices/userAuthSlice";
import i18n from "@/i18n";
import { useSetAppLanguage } from "@/components/i18n/LanguageSync";
import {
  clearCheckout,
  confirmCheckout,
  fetchEnrollment,
  fetchEnrollments,
  applyCoupon,
  confirmFreeCheckout,
  fetchOxxoVoucher,
  removeCoupon,
  fetchRecommendations,
  sendFeedback,
  startCheckout,
  startTransfer,
} from "@/store/slices/portalSlice";

export function AccountHome() {
  const { t, i18n: i18nInstance } = useTranslation();
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session_id");
  const celebrate = searchParams.get("celebrate");
  const paid = searchParams.get("paid");
  const token = useAppSelector((state) => state.userAuth.token);
  const { enrollments, recommendations, loading, error } = useAppSelector((state) => state.portal);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const locale = i18nInstance.language?.startsWith("en") ? "en-US" : "es-MX";

  const reviewable = useMemo(
    () => enrollments.filter((item) => item.status === "paid" || item.status === "attended"),
    [enrollments],
  );

  const feedback = useFormik({
    enableReinitialize: true,
    initialValues: {
      enrollmentId: reviewable[0]?.id || 0,
      rating: 5,
      comment: "",
    },
    validationSchema: Yup.object({
      enrollmentId: Yup.number().integer().positive().required(),
      rating: Yup.number().min(1).max(5).required(),
      comment: Yup.string().max(800),
    }),
    onSubmit: async (values) => {
      setFeedbackError(null);
      setFeedbackSaved(false);
      setFeedbackBusy(true);
      const result = await dispatch(
        sendFeedback({
          enrollmentId: Number(values.enrollmentId),
          rating: Number(values.rating),
          comment: values.comment,
        }),
      );
      setFeedbackBusy(false);
      if (sendFeedback.fulfilled.match(result)) {
        setFeedbackSaved(true);
        return;
      }
      setFeedbackError(String(result.payload || ""));
    },
  });

  useEffect(() => {
    if (!token) return;
    // Legacy Stripe return URLs landed on /cuenta — send them to the success page.
    if (sessionId || celebrate === "1") {
      const params = new URLSearchParams();
      if (sessionId) params.set("session_id", sessionId);
      if (paid) params.set("paid", paid);
      navigate(`/cuenta/exito?${params.toString()}`, { replace: true });
      return;
    }
    void dispatch(fetchUserMe());
    void dispatch(fetchEnrollments());
    void dispatch(fetchRecommendations());
  }, [celebrate, dispatch, navigate, paid, sessionId, token]);

  useEffect(() => {
    if (loading || sessionId || celebrate === "1") return;
    if (window.location.hash !== "#mis-cursos") return;
    const el = document.getElementById("mis-cursos");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [celebrate, enrollments.length, loading, sessionId]);

  if (!token) return <Navigate to="/login" replace />;
  if (sessionId || celebrate === "1") return null;

  const next = enrollments.find((item) => item.status === "pending" || item.status === "paid");
  const waitingOxxo =
    searchParams.get("oxxo") === "1" || (next?.paymentMethod === "oxxo" && next.status === "pending");

  return (
    <ClientShell metaTitle={t("account.title")} metaPath="/cuenta">
      <section className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight break-words sm:text-5xl">{t("account.title")}</h1>
        {waitingOxxo ? (
          <div className="mt-6 rounded-xl border border-citrus/40 bg-citrus/15 px-5 py-4 text-sm leading-6 text-ink">
            <p className="font-semibold">{t("pay.oxxoPendingTitle")}</p>
            <p className="mt-1 text-ink/75">{t("pay.oxxoPendingBody")}</p>
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        {loading ? <AccountHomeSkeleton /> : null}
        {!loading && next ? (
          <div className="mt-8 overflow-hidden rounded-2xl bg-ink text-paper shadow-[0_24px_60px_-24px_rgba(18,53,43,0.45)]">
            <div className="grid gap-0 md:grid-cols-[180px_1fr]">
              <div className="aspect-[4/3] bg-secondary md:aspect-auto md:min-h-full">
                <img
                  src={courseCoverUrl(next.slug, next.coverImageUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6 sm:p-7">
                <p className="text-xs uppercase tracking-[0.16em] text-citrus">{t("account.next")}</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{next.title}</h2>
                <p className="mt-2 text-paper/70">{next.promise}</p>
                <p className="mt-4 text-sm text-paper/85">
                  {new Date(next.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {next.venueName}
                </p>
                <p className="mt-2 text-sm text-paper/55">
                  {t("account.method")}:{" "}
                  {next.paymentMethod === "oxxo"
                    ? t("pay.oxxo")
                    : next.paymentMethod === "transfer"
                      ? t("pay.transfer")
                      : next.paymentMethod || "—"}
                  {next.cardLast4 ? ` ···· ${next.cardLast4}` : ""}
                </p>
                {next.status === "pending" && next.paymentMethod !== "oxxo" ? (
                  <Link
                    to={`/cuenta/pagar/${next.id}`}
                    className="mt-5 inline-flex rounded-xl bg-citrus px-4 py-2.5 text-sm font-semibold text-ink transition hover:brightness-105"
                  >
                    {next.paymentMethod === "transfer" ? t("pay.transferView") : t("account.pay")}
                  </Link>
                ) : next.status === "pending" && next.paymentMethod === "oxxo" ? (
                  <p className="mt-4 text-sm text-citrus">{t("pay.oxxoWaiting")}</p>
                ) : (
                  <p className="mt-4 text-sm text-citrus">{t("account.paid")}</p>
                )}
              </div>
            </div>
          </div>
        ) : !loading && enrollments.length === 0 ? (
          <div className="mt-8">
            <p className="text-muted-foreground">{t("account.none")}</p>
            <Link to="/cursos" className="mt-4 inline-flex text-sm font-semibold text-primary">
              {t("account.browse")}
            </Link>
          </div>
        ) : null}

        {!loading ? (
          <div id="mis-cursos" className="mt-12 scroll-mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{t("account.myCourses")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("account.myCoursesBody")}</p>
              </div>
              <Link to="/cursos" className="text-sm font-semibold text-primary hover:underline">
                {t("account.browse")}
              </Link>
            </div>

            {enrollments.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">{t("account.myCoursesEmpty")}</p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {enrollments.map((item) => {
                  const statusLabel = item.status === "pending" ? t("account.pending") : t("account.paid");
                  return (
                    <article
                      key={item.id}
                      className="group overflow-hidden rounded-2xl border border-border bg-paper transition hover:border-citrus/50"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                        <img
                          src={courseCoverUrl(item.slug, item.coverImageUrl)}
                          alt=""
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                        <span
                          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            item.status === "pending" ? "bg-paper/95 text-ink" : "bg-citrus text-ink"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {item.city}
                        </p>
                        <h3 className="font-display text-xl font-semibold tracking-tight">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(item.startsAt).toLocaleString(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <p className="text-sm font-semibold">{formatMoney(item.amountCents, item.currency)}</p>
                          {item.status === "pending" && item.paymentMethod !== "oxxo" ? (
                            <Link
                              to={`/cuenta/pagar/${item.id}`}
                              className="text-sm font-semibold text-primary hover:underline"
                            >
                              {t("account.pay")}
                            </Link>
                          ) : (
                            <Link
                              to={`/cursos/${item.slug}`}
                              className="text-sm font-semibold text-primary hover:underline"
                            >
                              {t("account.openCourse")}
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {!loading && reviewable.length > 0 ? (
          <form
            className="mt-12 max-w-lg space-y-4 rounded-2xl border border-border bg-card/80 p-5 sm:p-6"
            onSubmit={feedback.handleSubmit}
          >
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{t("account.feedback")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("account.feedbackHint")}</p>
            </div>

            {reviewable.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="feedback-enrollment">{t("account.myCourses")}</Label>
                <select
                  id="feedback-enrollment"
                  className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                  value={feedback.values.enrollmentId}
                  onChange={(event) => {
                    setFeedbackSaved(false);
                    void feedback.setFieldValue("enrollmentId", Number(event.target.value));
                  }}
                >
                  {reviewable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm font-medium text-ink">{reviewable[0]?.title}</p>
            )}

            <div className="space-y-2">
              <Label>{t("account.ratingLabel")}</Label>
              <StarRating
                value={Number(feedback.values.rating) || 0}
                onChange={(rating) => {
                  setFeedbackSaved(false);
                  void feedback.setFieldValue("rating", rating);
                }}
                disabled={feedbackBusy}
                size="lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-comment">{t("account.feedbackComment")}</Label>
              <Textarea
                id="feedback-comment"
                rows={3}
                placeholder={t("account.feedbackComment")}
                {...feedback.getFieldProps("comment")}
              />
            </div>

            {feedbackError ? <p className="text-sm text-destructive">{feedbackError}</p> : null}
            {feedbackSaved ? <p className="text-sm font-medium text-primary">{t("account.feedbackSaved")}</p> : null}

            <Button type="submit" disabled={feedbackBusy || !feedback.values.enrollmentId || !feedback.values.rating}>
              {feedbackBusy ? t("common.loading") : t("common.save")}
            </Button>
          </form>
        ) : null}

        {!loading && recommendations.length ? (
          <div className="mt-12">
            <h2 className="font-display text-2xl font-semibold">{t("account.recommendations")}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {recommendations.map((course) => (
                <Link key={course.id} to={`/cursos/${course.slug}`} className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{course.level}</p>
                  <p className="mt-2 font-semibold">{course.title}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </ClientShell>
  );
}

export function PaymentSuccess() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paidId = Number(searchParams.get("paid"));
  const token = useAppSelector((state) => state.userAuth.token);
  const { enrollments, loading, error, activeEnrollment } = useAppSelector((state) => state.portal);
  const [confirming, setConfirming] = useState(Boolean(sessionId));
  const [ready, setReady] = useState(!sessionId);

  useEffect(() => {
    if (!token) return;
    void dispatch(fetchUserMe());
    if (Number.isFinite(paidId) && paidId > 0) void dispatch(fetchEnrollment(paidId));
    void dispatch(fetchEnrollments());
  }, [dispatch, paidId, token]);

  useEffect(() => {
    if (!token || !sessionId) return;
    let cancelled = false;
    setConfirming(true);
    void dispatch(confirmCheckout(sessionId)).then((result) => {
      if (cancelled) return;
      if (confirmCheckout.fulfilled.match(result)) {
        if (result.payload.status === "pending_oxxo") {
          navigate(`/cuenta/pagar/${result.payload.enrollmentId}`, { replace: true });
          return;
        }
        const enrollmentId = result.payload.enrollmentId || paidId;
        navigate(`/cuenta/exito?paid=${enrollmentId}`, { replace: true });
        void dispatch(fetchEnrollment(enrollmentId));
        void dispatch(fetchEnrollments());
        setReady(true);
      }
      setConfirming(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate, paidId, sessionId, token]);

  if (!token) return <Navigate to="/login" replace />;
  if (!sessionId && !(Number.isFinite(paidId) && paidId > 0)) {
    return <Navigate to="/cuenta" replace />;
  }

  const enrollment =
    (activeEnrollment?.id === paidId ? activeEnrollment : null) ||
    enrollments.find((item) => item.id === paidId) ||
    enrollments.find((item) => item.status === "paid" || item.status === "attended") ||
    null;

  return (
    <ClientShell metaTitle={t("account.celebrateTitle")} metaPath="/cuenta/exito">
      {confirming || (loading && !enrollment) ? (
        <div className="mx-auto max-w-3xl px-5 py-16">
          <AccountPaySkeleton />
          <p className="mt-4 text-sm text-muted-foreground">{t("account.confirmingPayment")}</p>
        </div>
      ) : null}
      {error && !confirming ? (
        <div className="mx-auto max-w-3xl px-5 py-12">
          <p className="text-sm text-destructive">{error}</p>
          <Link to="/cuenta" className="mt-4 inline-flex text-sm font-semibold text-primary">
            {t("account.celebrateContinue")}
          </Link>
        </div>
      ) : null}
      {ready && !confirming ? (
        <PaymentCelebration
          enrollment={enrollment}
          locale={i18n.language || "es"}
          burstKey={String(Number.isFinite(paidId) && paidId > 0 ? paidId : sessionId || "success")}
        />
      ) : null}
    </ClientShell>
  );
}

export function AccountProfile() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const setLanguage = useSetAppLanguage();
  const token = useAppSelector((state) => state.userAuth.token);
  const user = useAppSelector((state) => state.userAuth.user);

  useEffect(() => {
    if (token) void dispatch(fetchUserMe());
  }, [dispatch, token]);

  const form = useFormik({
    enableReinitialize: true,
    initialValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      audience: user?.audience || "professional",
      preferredLanguage: user?.preferredLanguage || resolveAppLanguage(i18n.language),
    },
    validationSchema: Yup.object({
      firstName: Yup.string().trim().required(t("common.required")),
      lastName: Yup.string().trim(),
      phone: Yup.string(),
      audience: Yup.string().required(),
      preferredLanguage: Yup.string().oneOf(["es", "en"]).required(),
    }),
    onSubmit: async (values) => {
      const language = values.preferredLanguage as "es" | "en";
      await dispatch(
        updateUserProfile({
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || null,
          audience: values.audience as "professional" | "student" | "general",
          preferredLanguage: language,
        }),
      );
      await setLanguage(language);
    },
  });

  if (!token) return <Navigate to="/login" replace />;

  return (
    <ClientShell metaTitle={t("account.profile")} metaPath="/cuenta/perfil">
      <section className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold break-words sm:text-4xl">{t("account.profile")}</h1>
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("common.firstName")}</Label>
            <Input id="firstName" {...form.getFieldProps("firstName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t("common.lastName")}</Label>
            <Input id="lastName" {...form.getFieldProps("lastName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("account.phone")}</Label>
            <Input id="phone" {...form.getFieldProps("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience">{t("account.audience")}</Label>
            <select id="audience" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("audience")}>
              <option value="professional">{t("account.professional")}</option>
              <option value="student">{t("account.student")}</option>
              <option value="general">{t("account.general")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredLanguage">{t("common.language")}</Label>
            <select
              id="preferredLanguage"
              className="h-11 w-full rounded-md border border-input bg-card px-3"
              {...form.getFieldProps("preferredLanguage")}
            >
              <option value="es">{t("common.langEs")}</option>
              <option value="en">{t("common.langEn")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("account.languageHint")}</p>
          </div>
          <Button type="submit">{t("common.save")}</Button>
        </form>
      </section>
    </ClientShell>
  );
}

function stripePublishableKey() {
  return import.meta.env.VITE_STRIPE_TEST_PUBLISHABLE_KEY || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
}

const stripePromise = stripePublishableKey() ? loadStripe(stripePublishableKey()) : null;

function PayForm({
  enrollmentId,
  submittingLabel,
  oxxoLabel,
  onOxxoVoucher,
}: {
  enrollmentId: number;
  submittingLabel: string;
  oxxoLabel: string;
  onOxxoVoucher?: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const checkoutState = useCheckout();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [methodType, setMethodType] = useState<string>("card");

  if (checkoutState.type === "loading") return <AccountPaySkeleton />;
  if (checkoutState.type === "error") return <p className="text-destructive">{checkoutState.error.message}</p>;
  const { checkout } = checkoutState;
  const isOxxo = methodType === "oxxo";

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setFormError(null);
        // if_required keeps OXXO on this page after the voucher modal closes;
        // card still redirects when Stripe requires it.
        const result = await checkout.confirm({ redirect: "if_required" });
        if (result.type === "error") {
          setFormError(result.error.message);
          setBusy(false);
          return;
        }

        const session = result.session;
        const status = session.status;
        if (status.type === "complete" && status.paymentStatus === "unpaid") {
          const confirmed = await dispatch(confirmCheckout(session.id));
          if (confirmCheckout.fulfilled.match(confirmed) && !confirmed.payload.voucher) {
            await dispatch(fetchOxxoVoucher({ enrollmentId, sessionId: session.id }));
          }
          onOxxoVoucher?.(session.id);
          // Mint a fresh open session so card/OXXO methods render again on this page.
          await dispatch(startCheckout(enrollmentId));
          setBusy(false);
          return;
        }

        if (status.type === "complete" && status.paymentStatus === "paid") {
          navigate(`/cuenta/exito?paid=${enrollmentId}&session_id=${session.id}`, { replace: true });
          return;
        }

        setBusy(false);
      }}
    >
      <PaymentElement
        options={{
          layout: {
            type: "accordion",
            defaultCollapsed: false,
            radios: "always",
            spacedAccordionItems: true,
          },
          wallets: { link: "never", applePay: "auto", googlePay: "auto" },
          paymentMethodOrder: ["card", "oxxo"],
          fields: {
            billingDetails: {
              email: "never",
              phone: "never",
              name: "auto",
            },
          },
          terms: { card: "auto" },
        }}
        onChange={(event) => {
          if (event.value?.type) setMethodType(event.value.type);
        }}
      />
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <p className="text-xs leading-5 text-muted-foreground">
        {t("pay.acceptPrefix")}{" "}
        <Link to="/legal/terminos" className="font-semibold text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          {t("pay.terms")}
        </Link>{" "}
        {t("pay.acceptAnd")}{" "}
        <Link to="/legal/privacidad" className="font-semibold text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          {t("pay.privacy")}
        </Link>
        .
      </p>
      <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
        {busy ? t("common.loading") : isOxxo ? oxxoLabel : submittingLabel}
      </Button>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-1">
        <li className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t("pay.secureEncrypted")}
        </li>
        <li className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t("pay.securePci")}
        </li>
        <li className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t("pay.secureNoStore")}
        </li>
      </ul>
    </form>
  );
}

export function PaySeat() {
  const { enrollmentId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.userAuth.token);
  const user = useAppSelector((state) => state.userAuth.user);
  const {
    clientSecret,
    error,
    errorCode,
    saving,
    loading,
    activeEnrollment,
    enrollments,
    oxxoSessionId,
    oxxoVoucher,
    transfer,
  } = useAppSelector((state) => state.portal);
  const id = Number(enrollmentId);
  const enrollment =
    activeEnrollment?.id === id ? activeEnrollment : enrollments.find((item) => item.id === id) || null;
  const publishable = stripePublishableKey();
  const paidAlready = enrollment?.status === "paid" || enrollment?.status === "attended";
  const seatUnavailable =
    enrollment?.status === "cancelled" ||
    enrollment?.status === "no_show" ||
    errorCode === "seat_unavailable" ||
    errorCode === "not_found";
  const oxxoPending = enrollment?.paymentMethod === "oxxo" && enrollment?.status === "pending";
  const transferPending =
    Boolean(transfer) || (enrollment?.paymentMethod === "transfer" && enrollment?.status === "pending");
  const returnSessionId = searchParams.get("session_id");
  const confirmingReturn = Boolean(returnSessionId);
  const [oxxoVoucherHint, setOxxoVoucherHint] = useState(false);
  const [oxxoModalOpen, setOxxoModalOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [payTab, setPayTab] = useState<"stripe" | "transfer">(
    transferPending ? "transfer" : "stripe",
  );
  const isFreeWithCoupon =
    Boolean(enrollment?.coupon || enrollment?.couponId) && Number(enrollment?.amountCents || 0) <= 0;
  const checkoutReady =
    activeEnrollment?.id === id &&
    (activeEnrollment.status === "pending" || activeEnrollment.status === "waitlist");
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

  useEffect(() => {
    dispatch(clearCheckout());
    setOxxoVoucherHint(false);
    setOxxoModalOpen(false);
    setPayTab("stripe");
    return () => {
      dispatch(clearCheckout());
    };
  }, [dispatch, enrollmentId]);

  useEffect(() => {
    if (!token) return;
    if (!user) void dispatch(fetchUserMe());
  }, [dispatch, token, user]);

  useEffect(() => {
    if (!token || !Number.isFinite(id) || id < 1) return;
    void dispatch(fetchEnrollment(id));
  }, [dispatch, id, token]);

  useEffect(() => {
    if (transferPending) setPayTab("transfer");
  }, [transferPending]);

  useEffect(() => {
    if (errorCode === "already_paid" || paidAlready) {
      navigate("/cuenta", { replace: true });
    }
  }, [errorCode, navigate, paidAlready]);

  // Stripe return_url lands here with session_id (card paid or OXXO voucher closed).
  useEffect(() => {
    if (!token || !returnSessionId) return;
    let cancelled = false;
    void dispatch(confirmCheckout(returnSessionId)).then(async (result) => {
      if (cancelled) return;
      if (!confirmCheckout.fulfilled.match(result)) {
        setSearchParams({}, { replace: true });
        return;
      }
      const enrollmentIdPaid = result.payload.enrollmentId || id;
      if (result.payload.status === "paid") {
        navigate(`/cuenta/exito?paid=${enrollmentIdPaid}`, { replace: true });
        return;
      }
      // OXXO voucher issued — open our branded modal (Stripe's modal already closed).
      setOxxoVoucherHint(true);
      setOxxoModalOpen(true);
      setPayTab("stripe");
      if (!result.payload.voucher) {
        await dispatch(
          fetchOxxoVoucher({
            enrollmentId: enrollmentIdPaid,
            sessionId: returnSessionId,
          }),
        );
      }
      setSearchParams({}, { replace: true });
      await dispatch(startCheckout({ enrollmentId: enrollmentIdPaid, preferStripe: true }));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, id, navigate, returnSessionId, setSearchParams, token]);

  useEffect(() => {
    if (!token || !checkoutReady || paidAlready || seatUnavailable || confirmingReturn) {
      return;
    }
    if (isFreeWithCoupon) return;
    if (payTab === "transfer") {
      if (!transfer) void dispatch(startTransfer(id));
      return;
    }
    if (!publishable) return;
    // Always (re)load an open Checkout Session so payment methods stay available —
    // including after an OXXO voucher, when the API mints a fresh session.
    if (clientSecret) return;
    void dispatch(startCheckout({ enrollmentId: id, preferStripe: true }));
  }, [
    checkoutReady,
    clientSecret,
    confirmingReturn,
    dispatch,
    id,
    isFreeWithCoupon,
    paidAlready,
    payTab,
    publishable,
    seatUnavailable,
    token,
    transfer,
  ]);

  if (!token) return <Navigate to="/login" replace />;
  if (!Number.isFinite(id) || id < 1) return <Navigate to="/cuenta" replace />;
  if (paidAlready) return <Navigate to="/cuenta" replace />;

  const dateLabel = enrollment
    ? new Date(enrollment.startsAt).toLocaleString(i18n.language?.startsWith("en") ? "en-US" : "es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const displayError =
    errorCode === "not_found"
      ? t("pay.notFound")
      : errorCode === "seat_unavailable"
        ? t("pay.unavailable")
        : error;

  const showOxxoHint = oxxoVoucherHint || oxxoPending;
  const showStripeTab = !isFreeWithCoupon && payTab === "stripe";
  const showCheckoutForm = Boolean(
    showStripeTab && clientSecret && publishable && stripePromise && !seatUnavailable,
  );
  const showTransferPanel =
    !isFreeWithCoupon && payTab === "transfer" && transfer && !seatUnavailable;
  const stripeLoading =
    showStripeTab &&
    !seatUnavailable &&
    (confirmingReturn ||
      saving ||
      (loading && !enrollment) ||
      (!clientSecret && publishable && !displayError));
  const transferLoading =
    !isFreeWithCoupon && payTab === "transfer" && !transfer && (saving || loading) && !displayError;

  const selectTab = (tab: "stripe" | "transfer") => {
    setPayTab(tab);
    if (tab === "transfer") {
      void dispatch(startTransfer(id));
      return;
    }
    void dispatch(startCheckout({ enrollmentId: id, preferStripe: true }));
  };

  return (
    <ClientShell metaTitle={t("pay.title")} metaDescription={t("pay.body")} metaPath={`/cuenta/pagar/${enrollmentId || ""}`}>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 10% 0%, rgba(159,198,91,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 20%, rgba(18,53,43,0.08), transparent 50%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-10 lg:py-14">
          <Link to="/cuenta" className="inline-flex text-sm font-medium text-muted-foreground transition hover:text-ink">
            ← {t("pay.back")}
          </Link>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-10">
            <aside className="overflow-hidden rounded-2xl border border-border bg-paper shadow-[0_20px_60px_rgba(18,35,27,0.08)]">
              {enrollment ? (
                <>
                  <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                    <img
                      src={courseCoverUrl(enrollment.slug, enrollment.coverImageUrl)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 text-paper">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-citrus">
                        {enrollment.category} · {enrollment.city}
                      </p>
                      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        {enrollment.title}
                      </h1>
                    </div>
                  </div>
                  <div className="space-y-5 p-6 sm:p-7">
                    <p className="text-base leading-7 text-muted-foreground">{enrollment.promise}</p>
                    <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t("pay.when")}
                        </dt>
                        <dd className="mt-1.5 text-sm font-semibold leading-6 text-ink">{dateLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t("pay.where")}
                        </dt>
                        <dd className="mt-1.5 text-sm font-semibold leading-6 text-ink">
                          {enrollment.venueName}
                          <span className="block font-normal text-muted-foreground">{enrollment.city}</span>
                        </dd>
                      </div>
                    </dl>
                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {t("pay.youPay")}
                        </p>
                        {enrollment.discountCents && enrollment.discountCents > 0 && enrollment.listAmountCents != null ? (
                          <p className="mt-1 text-sm text-muted-foreground line-through">
                            {formatMoney(enrollment.listAmountCents, enrollment.currency)}
                          </p>
                        ) : null}
                        <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
                          {formatMoney(enrollment.amountCents, enrollment.currency)}
                        </p>
                        {enrollment.coupon?.code ? (
                          <p className="mt-1 text-xs font-medium text-primary break-all">
                            {t("pay.couponApplied", { code: enrollment.coupon.code })}
                          </p>
                        ) : null}
                      </div>
                      <p className="max-w-[12rem] text-right text-xs leading-5 text-muted-foreground">
                        {t("pay.includesSeat")}
                      </p>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
                        {t("pay.bulletCard")}
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
                        {t("pay.bulletOxxo")}
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-citrus" />
                        {t("pay.bulletTransfer")}
                      </li>
                    </ul>
                  </div>
                </>
              ) : loading ? (
                <div className="p-6">
                  <AccountPaySkeleton />
                </div>
              ) : (
                <div className="space-y-3 p-6 sm:p-7">
                  <h1 className="font-display text-2xl font-semibold tracking-tight">{t("pay.notFoundTitle")}</h1>
                  <p className="text-sm text-muted-foreground">{t("pay.notFound")}</p>
                </div>
              )}
            </aside>

            <div className="min-w-0 max-w-full rounded-2xl border border-border bg-card/90 p-6 shadow-[0_20px_60px_rgba(18,35,27,0.06)] backdrop-blur sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("pay.checkoutEyebrow")}</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{t("pay.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("pay.body")}</p>
              {displayError ? <p className="mt-4 text-sm text-destructive">{displayError}</p> : null}

              {!seatUnavailable ? (
                <div className="mt-6 space-y-3 rounded-xl border border-border bg-paper/70 p-4">
                  <Label htmlFor="coupon-code">{t("pay.couponLabel")}</Label>
                  {enrollment?.coupon?.code ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold break-all">
                        {enrollment.coupon.code}
                        <span className="ml-2 font-normal text-muted-foreground">
                          −{formatMoney(enrollment.discountCents || 0, enrollment.currency)}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => {
                          void dispatch(removeCoupon(id)).then((result) => {
                            if (removeCoupon.fulfilled.match(result)) {
                              setCouponInput("");
                              setPayTab("stripe");
                            }
                          });
                        }}
                      >
                        {t("pay.couponRemove")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="coupon-code"
                        value={couponInput}
                        onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                        placeholder={t("pay.couponPlaceholder")}
                        className="min-w-0 flex-1"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        className="sm:shrink-0"
                        disabled={saving || couponInput.trim().length < 2}
                        onClick={() => {
                          void dispatch(applyCoupon({ enrollmentId: id, code: couponInput.trim() })).then(
                            (result) => {
                              if (applyCoupon.fulfilled.match(result) && result.payload.free) {
                                setPayTab("stripe");
                              }
                            },
                          );
                        }}
                      >
                        {t("pay.couponApply")}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              {isFreeWithCoupon && !seatUnavailable ? (
                <div className="mt-6 space-y-4 rounded-xl border border-citrus/40 bg-citrus/15 px-5 py-5">
                  <div>
                    <p className="font-semibold text-ink">{t("pay.couponFreeTitle")}</p>
                    <p className="mt-1.5 text-sm leading-6 text-ink/80">{t("pay.couponFreeBody")}</p>
                  </div>
                  <Button
                    type="button"
                    className="h-12 w-full text-base"
                    disabled={saving}
                    onClick={() => {
                      void dispatch(confirmFreeCheckout(id)).then((result) => {
                        if (confirmFreeCheckout.fulfilled.match(result)) {
                          navigate(`/cuenta/exito?paid=${id}`, { replace: true });
                        }
                      });
                    }}
                  >
                    {saving ? t("common.loading") : t("pay.couponFreeConfirm")}
                  </Button>
                </div>
              ) : null}

              {!seatUnavailable && !isFreeWithCoupon ? (
                <div
                  className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="tablist"
                  aria-label={t("pay.methodPicker")}
                >
                  {(
                    [
                      ["stripe", t("pay.methodStripe")],
                      ["transfer", t("pay.transfer")],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={payTab === key}
                      className={`min-w-0 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        payTab === key
                          ? "border-ink bg-ink text-paper"
                          : "border-border bg-paper text-ink hover:border-ink/30"
                      }`}
                      onClick={() => selectTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {showStripeTab && !publishable ? <p className="mt-6 text-sm">{t("pay.missing")}</p> : null}

              {showOxxoHint && showStripeTab ? (
                <div className="mt-6 rounded-xl border border-citrus/40 bg-citrus/15 px-5 py-4 text-sm leading-6 text-ink">
                  <p className="font-semibold">{t("pay.oxxoStayTitle")}</p>
                  <p className="mt-1.5 text-ink/80">{t("pay.oxxoStayBody")}</p>
                  <p className="mt-2 text-xs text-ink/65">{t("pay.oxxoStayHint")}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="h-10"
                      onClick={() => {
                        if (oxxoVoucher) {
                          setOxxoModalOpen(true);
                          return;
                        }
                        void dispatch(
                          fetchOxxoVoucher({
                            enrollmentId: id,
                            ...(oxxoSessionId ? { sessionId: oxxoSessionId } : {}),
                          }),
                        ).then((result) => {
                          if (fetchOxxoVoucher.fulfilled.match(result)) setOxxoModalOpen(true);
                        });
                      }}
                    >
                      {t("pay.oxxoOpenModal")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {stripeLoading || transferLoading ? (
                <div className="mt-6">
                  <AccountPaySkeleton />
                </div>
              ) : null}

              {showTransferPanel ? (
                <TransferInstructions transfer={transfer!} onSwitchMethod={() => selectTab("stripe")} />
              ) : null}

              {showCheckoutForm ? (
                <div className="mt-6">
                  <CheckoutProvider
                    key={clientSecret || fullName || "pending-name"}
                    stripe={stripePromise}
                    options={{
                      clientSecret: clientSecret!,
                      ...(fullName
                        ? {
                            defaultValues: {
                              billingAddress: {
                                name: fullName,
                                address: { country: "MX" },
                              },
                            },
                          }
                        : {}),
                      elementsOptions: {
                        appearance: {
                          theme: "stripe",
                          variables: {
                            colorPrimary: "#12352b",
                            colorBackground: "#fbfaf4",
                            colorText: "#12352b",
                            colorDanger: "#b42318",
                            fontFamily: "inherit",
                            borderRadius: "10px",
                            spacingUnit: "4px",
                          },
                        },
                      },
                    }}
                  >
                    <PayForm
                      enrollmentId={id}
                      submittingLabel={t("pay.confirm")}
                      oxxoLabel={t("pay.confirmOxxo")}
                      onOxxoVoucher={() => {
                        setOxxoVoucherHint(true);
                        setOxxoModalOpen(true);
                        setPayTab("stripe");
                      }}
                    />
                  </CheckoutProvider>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <OxxoVoucherModal
        open={oxxoModalOpen}
        onClose={() => setOxxoModalOpen(false)}
        enrollmentId={id}
        sessionId={oxxoSessionId}
        voucher={oxxoVoucher}
      />
    </ClientShell>
  );
}
