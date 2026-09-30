import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUserMe } from "@/store/slices/userAuthSlice";
import { cn } from "@/lib/utils";

function initialsFor(firstName: string, lastName: string, email: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  if (first || last) return `${first}${last}`.toUpperCase();
  return email.trim().charAt(0).toUpperCase() || "D";
}

/** Compact signed-in chip for marketing / public headers. */
export function HeaderAccountChip({ className }: { className?: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.userAuth.token);
  const user = useAppSelector((state) => state.userAuth.user);

  useEffect(() => {
    if (token && !user) void dispatch(fetchUserMe());
  }, [dispatch, token, user]);

  if (!token) {
    return (
      <Link to="/login" className={cn("domina-header-auth", className)}>
        {t("common.enter")}
      </Link>
    );
  }

  const label = user?.firstName?.trim() || user?.email?.split("@")[0] || t("nav.account");
  const initials = user ? initialsFor(user.firstName, user.lastName, user.email) : "·";

  return (
    <Link
      to="/cuenta"
      className={cn("domina-header-account", className)}
      aria-label={`${t("nav.account")}: ${label}`}
      title={user?.email || t("nav.account")}
    >
      <span className="domina-header-account-avatar" aria-hidden>
        {initials}
      </span>
      <span className="domina-header-account-copy">
        <span className="domina-header-account-name">{label}</span>
        <span className="domina-header-account-meta">{t("nav.account")}</span>
      </span>
    </Link>
  );
}
