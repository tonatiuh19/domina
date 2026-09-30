import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@shared/api";
import { applyDocumentLanguage, resolveAppLanguage, writeStoredLanguage } from "@/lib/language";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateUserLanguage } from "@/store/slices/userAuthSlice";
import { updateAdminLanguage } from "@/store/slices/adminAuthSlice";

/**
 * Keeps UI language, <html lang>, localStorage, and account preference aligned.
 * Priority when authenticated: account preferredLanguage (if set).
 * Otherwise: detector (localStorage → browser → es).
 */
export function LanguageSync() {
  const { i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.userAuth.user);
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const appliedAccountRef = useRef<string | null>(null);

  useEffect(() => {
    const onChanged = (lng: string) => {
      const next = resolveAppLanguage(lng);
      writeStoredLanguage(next);
      applyDocumentLanguage(next);
    };
    i18n.on("languageChanged", onChanged);
    onChanged(i18n.language);
    return () => {
      i18n.off("languageChanged", onChanged);
    };
  }, [i18n]);

  useEffect(() => {
    const preferred = (user?.preferredLanguage || admin?.preferredLanguage || null) as AppLanguage | null;
    const accountKey = user
      ? `user:${user.id}:${preferred || "unset"}`
      : admin
        ? `admin:${admin.id}:${preferred || "unset"}`
        : null;

    if (!accountKey) {
      appliedAccountRef.current = null;
      return;
    }
    if (!preferred) return;
    if (appliedAccountRef.current === accountKey) return;
    appliedAccountRef.current = accountKey;
    if (resolveAppLanguage(i18n.language) !== preferred) {
      void i18n.changeLanguage(preferred);
    } else {
      writeStoredLanguage(preferred);
      applyDocumentLanguage(preferred);
    }
  }, [admin, i18n, user]);

  return null;
}

export function useSetAppLanguage() {
  const { i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const userToken = useAppSelector((state) => state.userAuth.token);
  const adminToken = useAppSelector((state) => state.adminAuth.token);

  return async (language: AppLanguage) => {
    const next = resolveAppLanguage(language);
    writeStoredLanguage(next);
    applyDocumentLanguage(next);
    await i18n.changeLanguage(next);
    if (userToken) {
      await dispatch(updateUserLanguage(next));
    } else if (adminToken) {
      await dispatch(updateAdminLanguage(next));
    }
  };
}
