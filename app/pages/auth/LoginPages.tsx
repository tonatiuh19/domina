import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ArrowLeft, Hammer, Loader2, Mail, MapPin, ShieldCheck, Timer, UserRound, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthOtpInput } from "@/components/auth/AuthOtpInput";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  checkUserEmail,
  clearUserError,
  requestUserOtp,
  verifyUserOtp,
} from "@/store/slices/userAuthSlice";
import {
  checkAdminEmail,
  clearAdminError,
  requestAdminOtp,
  verifyAdminOtp,
} from "@/store/slices/adminAuthSlice";

const WORKSHOP_IMAGE =
  "https://disruptinglabs.com/data/api/data/domina/mecanica-basica-para-mujeres/main_image/6abc7f373fa5d_1790738231.jpg";
const STAFF_IMAGE =
  "https://disruptinglabs.com/data/api/data/domina/power-bi-practico/main_image/6abc7f39043a6_1790738233.jpg";

function FormHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 text-center">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.65rem]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function CodeStep({
  email,
  busy,
  sending,
  error,
  onCode,
  onResend,
  onBack,
}: {
  email: string;
  busy: boolean;
  sending: boolean;
  error: string | null;
  onCode: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");

  return (
    <div className="space-y-5">
      <FormHeading title={t("auth.codeTitle")} subtitle={t("auth.codeSubtitle", { email })} />
      <div className="truncate rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
        {email}
      </div>
      <AuthOtpInput
        value={code}
        disabled={busy}
        onChange={setCode}
        onComplete={(value) => {
          if (!busy) onCode(value);
        }}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="h-12 w-full rounded-xl text-sm font-semibold"
        disabled={busy || code.length !== 6}
        onClick={() => onCode(code)}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          t("common.verify")
        )}
      </Button>
      <button
        type="button"
        disabled={sending}
        onClick={onResend}
        className="w-full text-sm font-semibold text-primary hover:underline disabled:opacity-60"
      >
        {sending ? t("auth.resending") : t("auth.resendCode")}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-1 py-1 text-sm text-muted-foreground transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t("auth.backStep")}
      </button>
    </div>
  );
}

export function UserLogin() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const auth = useAppSelector((state) => state.userAuth);
  const [step, setStep] = useState<"email" | "profile" | "code">("email");
  const [email, setEmail] = useState("");

  const stats = useMemo(
    () => [
      { value: "70%", label: t("auth.statPractice"), icon: Hammer },
      { value: "GDL", label: t("auth.statCity"), icon: MapPin },
      { value: "1d", label: t("auth.statDuration"), icon: Timer },
    ],
    [t],
  );

  const testimonials = useMemo(
    () => [
      {
        quote: t("auth.testimonial1Quote"),
        name: t("auth.testimonial1Name"),
        detail: t("auth.testimonial1Detail"),
        initial: "M",
      },
      {
        quote: t("auth.testimonial2Quote"),
        name: t("auth.testimonial2Name"),
        detail: t("auth.testimonial2Detail"),
        initial: "L",
      },
      {
        quote: t("auth.testimonial3Quote"),
        name: t("auth.testimonial3Name"),
        detail: t("auth.testimonial3Detail"),
        initial: "S",
      },
    ],
    [t],
  );

  const emailForm = useFormik({
    initialValues: { email: "" },
    validationSchema: Yup.object({
      email: Yup.string().email(t("common.invalidEmail")).required(t("common.required")),
    }),
    onSubmit: async (values) => {
      const normalized = values.email.trim().toLowerCase();
      setEmail(normalized);
      dispatch(clearUserError());
      const checked = await dispatch(checkUserEmail(normalized));
      if (checkUserEmail.rejected.match(checked)) return;
      if (checked.payload?.exists) {
        const sent = await dispatch(requestUserOtp({ email: normalized }));
        if (requestUserOtp.fulfilled.match(sent)) setStep("code");
        return;
      }
      setStep("profile");
    },
  });

  const profileForm = useFormik({
    initialValues: { firstName: "", lastName: "", audience: "professional" },
    validationSchema: Yup.object({
      firstName: Yup.string().trim().required(t("common.required")),
      lastName: Yup.string().trim(),
      audience: Yup.string().required(),
    }),
    onSubmit: async (values) => {
      const sent = await dispatch(
        requestUserOtp({
          email,
          firstName: values.firstName,
          lastName: values.lastName,
          audience: values.audience as "professional" | "student" | "general",
        }),
      );
      if (requestUserOtp.fulfilled.match(sent)) setStep("code");
    },
  });

  const formTitle =
    step === "email" ? t("auth.formTitleEmail") : step === "profile" ? t("auth.formTitleProfile") : t("auth.codeTitle");
  const formSubtitle =
    step === "email"
      ? t("auth.formSubtitleEmail")
      : step === "profile"
        ? t("auth.formSubtitleProfile")
        : t("auth.codeSubtitle", { email });

  return (
    <AuthShell
      headline={
        <>
          {t("auth.userTitleLead")}{" "}
          <span className="text-citrus">{t("auth.userTitleAccent")}</span>
        </>
      }
      subheadline={t("auth.userBody")}
      stats={stats}
      testimonials={testimonials}
      footerNote={t("auth.secure")}
      imageUrl={WORKSHOP_IMAGE}
      metaTitle={t("auth.userTitle")}
      metaDescription={t("seo.authUserDescription")}
      metaPath="/login"
    >
      {step !== "code" ? <FormHeading title={formTitle} subtitle={formSubtitle} /> : null}
      {auth.error && step !== "code" ? <p className="mb-4 text-sm text-destructive">{auth.error}</p> : null}

      {step === "email" ? (
        <form className="space-y-4" onSubmit={emailForm.handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">{t("common.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className="h-12 rounded-xl pl-10"
                placeholder={t("auth.emailPlaceholder")}
                {...emailForm.getFieldProps("email")}
              />
            </div>
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={auth.checking || auth.sending}>
            {auth.checking || auth.sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("common.continue")
            )}
          </Button>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            {t("auth.secure")}
          </p>
        </form>
      ) : null}

      {step === "profile" ? (
        <form className="space-y-4" onSubmit={profileForm.handleSubmit}>
          <div className="truncate rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
            {email}
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("common.firstName")}</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="firstName" className="h-12 rounded-xl pl-10" autoFocus {...profileForm.getFieldProps("firstName")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t("common.lastName")}</Label>
            <Input id="lastName" className="h-12 rounded-xl" {...profileForm.getFieldProps("lastName")} />
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={auth.sending}>
            {auth.sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("common.sendCode")
            )}
          </Button>
          <button
            type="button"
            onClick={() => {
              dispatch(clearUserError());
              setStep("email");
            }}
            className="inline-flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t("auth.backStep")}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <CodeStep
          email={email}
          busy={auth.verifying}
          sending={auth.sending}
          error={auth.error}
          onCode={async (code) => {
            const result = await dispatch(verifyUserOtp({ email, code }));
            if (verifyUserOtp.fulfilled.match(result)) navigate("/cuenta");
          }}
          onResend={() => {
            void dispatch(requestUserOtp({ email }));
          }}
          onBack={() => {
            dispatch(clearUserError());
            setStep("email");
          }}
        />
      ) : null}
    </AuthShell>
  );
}

export function StaffLogin() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const auth = useAppSelector((state) => state.adminAuth);
  const [step, setStep] = useState<"email" | "profile" | "code">("email");
  const [email, setEmail] = useState("");

  const stats = useMemo(
    () => [
      { value: "Ops", label: t("auth.statOps"), icon: Wrench },
      { value: "GDL", label: t("auth.statCity"), icon: MapPin },
      { value: "OTP", label: t("auth.statSecure"), icon: ShieldCheck },
    ],
    [t],
  );

  const testimonials = useMemo(
    () => [
      {
        quote: t("auth.staffTestimonial1Quote"),
        name: t("auth.staffTestimonial1Name"),
        detail: t("auth.staffTestimonial1Detail"),
        initial: "R",
      },
      {
        quote: t("auth.staffTestimonial2Quote"),
        name: t("auth.staffTestimonial2Name"),
        detail: t("auth.staffTestimonial2Detail"),
        initial: "A",
      },
      {
        quote: t("auth.staffTestimonial3Quote"),
        name: t("auth.staffTestimonial3Name"),
        detail: t("auth.staffTestimonial3Detail"),
        initial: "C",
      },
    ],
    [t],
  );

  const emailForm = useFormik({
    initialValues: { email: "" },
    validationSchema: Yup.object({
      email: Yup.string().email(t("common.invalidEmail")).required(t("common.required")),
    }),
    onSubmit: async (values) => {
      const normalized = values.email.trim().toLowerCase();
      setEmail(normalized);
      dispatch(clearAdminError());
      const checked = await dispatch(checkAdminEmail(normalized));
      if (checkAdminEmail.rejected.match(checked)) return;
      if (checked.payload?.exists) {
        const sent = await dispatch(requestAdminOtp({ email: normalized }));
        if (requestAdminOtp.fulfilled.match(sent)) setStep("code");
        return;
      }
      setStep("profile");
    },
  });

  const profileForm = useFormik({
    initialValues: { companyName: "", contactName: "" },
    validationSchema: Yup.object({
      companyName: Yup.string().trim().required(t("common.required")),
      contactName: Yup.string().trim().required(t("common.required")),
    }),
    onSubmit: async (values) => {
      const sent = await dispatch(
        requestAdminOtp({
          email,
          companyName: values.companyName,
          contactName: values.contactName,
        }),
      );
      if (requestAdminOtp.fulfilled.match(sent)) setStep("code");
    },
  });

  return (
    <AuthShell
      headline={
        <>
          {t("auth.staffTitleLead")}{" "}
          <span className="text-citrus">{t("auth.staffTitleAccent")}</span>
        </>
      }
      subheadline={t("auth.staffBody")}
      stats={stats}
      testimonials={testimonials}
      footerNote={t("auth.secure")}
      imageUrl={STAFF_IMAGE}
      metaTitle={t("auth.staffTitle")}
      metaDescription={t("seo.authStaffDescription")}
      metaPath="/acceso/equipo"
    >
      {step !== "code" ? (
        <FormHeading
          title={step === "email" ? t("auth.staffFormTitle") : t("auth.companyRegisterHint")}
          subtitle={step === "email" ? t("auth.staffFormSubtitle") : t("auth.formSubtitleProfile")}
        />
      ) : null}
      {auth.error && step !== "code" ? <p className="mb-4 text-sm text-destructive">{auth.error}</p> : null}

      {step === "email" ? (
        <form className="space-y-4" onSubmit={emailForm.handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="access-email">{t("common.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="access-email"
                type="email"
                autoComplete="email"
                autoFocus
                className="h-12 rounded-xl pl-10"
                placeholder={t("auth.emailPlaceholder")}
                {...emailForm.getFieldProps("email")}
              />
            </div>
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={auth.checking || auth.sending}>
            {auth.checking || auth.sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("common.continue")
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="font-semibold text-primary hover:underline">
              {t("auth.userEyebrow")}
            </Link>
          </p>
        </form>
      ) : null}

      {step === "profile" ? (
        <form className="space-y-4" onSubmit={profileForm.handleSubmit}>
          <div className="truncate rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
            {email}
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">{t("auth.companyName")}</Label>
            <Input id="companyName" className="h-12 rounded-xl" {...profileForm.getFieldProps("companyName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactName">{t("auth.contactName")}</Label>
            <Input id="contactName" className="h-12 rounded-xl" {...profileForm.getFieldProps("contactName")} />
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl text-sm font-semibold" disabled={auth.sending}>
            {auth.sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              t("common.sendCode")
            )}
          </Button>
          <button
            type="button"
            onClick={() => {
              dispatch(clearAdminError());
              setStep("email");
            }}
            className="inline-flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t("auth.backStep")}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <CodeStep
          email={email}
          busy={auth.verifying}
          sending={auth.sending}
          error={auth.error}
          onCode={async (code) => {
            const result = await dispatch(verifyAdminOtp({ email, code }));
            if (verifyAdminOtp.fulfilled.match(result)) {
              navigate(result.payload.admin.role === "company" ? "/admin/empresas" : "/admin");
            }
          }}
          onResend={() => {
            void dispatch(requestAdminOtp({ email }));
          }}
          onBack={() => {
            dispatch(clearAdminError());
            setStep("email");
          }}
        />
      ) : null}
    </AuthShell>
  );
}

export function CompanyLogin() {
  return <Navigate to="/acceso/equipo" replace />;
}
