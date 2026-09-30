import { useEffect, useId, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthOtpInput } from "@/components/auth/AuthOtpInput";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  checkUserEmail,
  clearUserError,
  requestUserOtp,
  verifyUserOtp,
} from "@/store/slices/userAuthSlice";

type Step = "email" | "profile" | "code";

export function ReserveAuthModal({
  open,
  onClose,
  onAuthenticated,
  editionLabel,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  editionLabel?: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.userAuth);
  const titleId = useId();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("email");
    setEmail("");
    setNeedsProfile(false);
    dispatch(clearUserError());
  }, [dispatch, open]);

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
        setNeedsProfile(false);
        const sent = await dispatch(requestUserOtp({ email: normalized }));
        if (requestUserOtp.fulfilled.match(sent)) setStep("code");
        return;
      }
      setNeedsProfile(true);
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

  const codeForm = useFormik({
    initialValues: { code: "" },
    validationSchema: Yup.object({
      code: Yup.string().matches(/^\d{6}$/, t("common.otpInvalid")).required(t("common.required")),
    }),
    onSubmit: async (values) => {
      const result = await dispatch(verifyUserOtp({ email, code: values.code }));
      if (verifyUserOtp.fulfilled.match(result)) onAuthenticated();
    },
  });

  if (!open) return null;

  const busy = auth.checking || auth.sending || auth.verifying;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center" role="presentation">
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
        className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-paper shadow-[0_24px_80px_rgba(18,35,27,0.28)]"
      >
        <div className="bg-ink px-6 py-5 text-paper">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-citrus">
                {t("auth.reserveEyebrow")}
              </p>
              <h2 id={titleId} className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {t("auth.reserveTitle")}
              </h2>
              {editionLabel ? <p className="mt-2 text-sm text-paper/65">{editionLabel}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-paper/20 p-2 text-paper/80 transition hover:bg-paper/10 hover:text-paper"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6 flex gap-2" aria-hidden>
            {(needsProfile ? (["email", "profile", "code"] as Step[]) : (["email", "code"] as Step[])).map(
              (item) => {
                const sequence = needsProfile
                  ? ({ email: 0, profile: 1, code: 2 } as const)
                  : ({ email: 0, code: 1, profile: -1 } as const);
                const reached = sequence[item] >= 0 && sequence[step] >= sequence[item];
                const current = step === item;
                return (
                  <span
                    key={item}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      current ? "bg-citrus" : reached ? "bg-ink/35" : "bg-border"
                    }`}
                  />
                );
              },
            )}
          </div>

          {auth.error ? <p className="mb-4 text-sm text-destructive">{auth.error}</p> : null}
          {auth.devCode ? (
            <p className="mb-4 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {t("auth.devCode")}: {auth.devCode}
            </p>
          ) : null}

          {step === "email" ? (
            <form className="space-y-4" onSubmit={emailForm.handleSubmit}>
              <p className="text-sm leading-6 text-muted-foreground">{t("auth.reserveBody")}</p>
              <div className="space-y-2">
                <Label htmlFor="reserve-email">{t("common.email")}</Label>
                <Input
                  id="reserve-email"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  {...emailForm.getFieldProps("email")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {t("common.continue")}
              </Button>
            </form>
          ) : null}

          {step === "profile" ? (
            <form className="space-y-4" onSubmit={profileForm.handleSubmit}>
              <p className="text-sm leading-6 text-muted-foreground">{t("auth.profileHint")}</p>
              <div className="space-y-2">
                <Label htmlFor="reserve-firstName">{t("common.firstName")}</Label>
                <Input id="reserve-firstName" autoFocus {...profileForm.getFieldProps("firstName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reserve-lastName">{t("common.lastName")}</Label>
                <Input id="reserve-lastName" {...profileForm.getFieldProps("lastName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reserve-audience">{t("account.audience")}</Label>
                <select
                  id="reserve-audience"
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                  {...profileForm.getFieldProps("audience")}
                >
                  <option value="professional">{t("account.professional")}</option>
                  <option value="student">{t("account.student")}</option>
                  <option value="general">{t("account.general")}</option>
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {t("common.sendCode")}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                onClick={() => setStep("email")}
              >
                {t("auth.backStep")}
              </button>
            </form>
          ) : null}

          {step === "code" ? (
            <form className="space-y-4" onSubmit={codeForm.handleSubmit}>
              <p className="text-sm leading-6 text-muted-foreground">
                {t("auth.codeSent")} <strong>{email}</strong>
              </p>
              <div className="space-y-2">
                <Label>{t("common.code")}</Label>
                <AuthOtpInput
                  value={codeForm.values.code}
                  disabled={busy}
                  aria-label={t("common.code")}
                  onChange={(code) => {
                    void codeForm.setFieldValue("code", code);
                    if (codeForm.errors.code) void codeForm.setFieldError("code", undefined);
                  }}
                  onComplete={(code) => {
                    if (busy) return;
                    void (async () => {
                      await codeForm.setFieldValue("code", code);
                      const result = await dispatch(verifyUserOtp({ email, code }));
                      if (verifyUserOtp.fulfilled.match(result)) onAuthenticated();
                    })();
                  }}
                />
                {codeForm.touched.code && codeForm.errors.code ? (
                  <p className="text-[11px] text-destructive">{codeForm.errors.code}</p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={busy || codeForm.values.code.length !== 6}>
                {t("auth.reserveConfirm")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
