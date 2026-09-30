import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, Compass, LogOut, UserRound } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PageMeta } from "@/components/site/PageMeta";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchUserMe, logoutUser } from "@/store/slices/userAuthSlice";
import { cn } from "@/lib/utils";

function initials(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const fromName = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.trim().toUpperCase();
  if (fromName) return fromName;
  return (email?.[0] || "D").toUpperCase();
}

export function ClientShell({
  children,
  metaTitle,
  metaDescription,
  metaPath,
}: {
  children: ReactNode;
  metaTitle?: string;
  metaDescription?: string;
  metaPath?: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((state) => state.userAuth.token);
  const user = useAppSelector((state) => state.userAuth.user);

  useEffect(() => {
    if (token && !user) void dispatch(fetchUserMe());
  }, [dispatch, token, user]);

  const links = [
    { to: "/cuenta", label: t("account.title"), icon: BookOpen, end: true },
    { to: "/cuenta/perfil", label: t("account.profile"), icon: UserRound, end: false },
    { to: "/cursos", label: t("catalog.title"), icon: Compass, end: false },
  ] as const;

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "DOMINA";

  return (
    <div className="portal-shell h-dvh max-w-[100vw] overflow-hidden bg-[hsl(42_28%_95%)]">
      <PageMeta
        title={metaTitle || t("account.title")}
        description={metaDescription || t("seo.accountDescription")}
        path={metaPath}
        robots="noindex, nofollow"
      />
      <aside className="fixed inset-x-0 top-0 z-30 flex max-h-[min(100dvh,100%)] flex-col overflow-y-auto border-b border-white/10 bg-ink text-paper md:inset-y-0 md:left-0 md:right-auto md:h-dvh md:w-[272px] md:overflow-hidden md:border-b-0 md:border-r md:border-white/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 0% 0%, rgba(159,198,91,0.22), transparent 52%), radial-gradient(ellipse 70% 45% at 100% 100%, rgba(255,255,255,0.06), transparent 55%)",
          }}
        />

        <div className="relative flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-5 md:block md:px-6 md:pb-6 md:pt-8">
          <Link to="/" className="group inline-flex flex-col gap-1">
            <span className="font-display text-2xl font-semibold tracking-tight transition group-hover:text-citrus">
              DOMINA
            </span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-paper/45 md:inline">
              {t("account.title")}
            </span>
          </Link>
          <div className="flex items-center gap-3 md:hidden">
            <LanguageSwitcher className="text-paper/50 hover:text-citrus" compact />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/45 transition hover:text-citrus"
              onClick={async () => {
                await dispatch(logoutUser());
                navigate("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {t("common.signOut")}
            </button>
          </div>
        </div>

        <nav className="relative flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-4 md:flex-1 md:flex-col md:gap-1 md:overflow-y-auto md:px-3 md:pb-6">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group relative inline-flex min-w-max items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition duration-200",
                  isActive
                    ? "bg-citrus text-ink shadow-[0_10px_30px_rgba(159,198,91,0.25)]"
                    : "text-paper/70 hover:bg-white/5 hover:text-paper",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition",
                      isActive ? "bg-ink/10 text-ink" : "bg-white/5 text-paper/55 group-hover:text-citrus",
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.1} aria-hidden />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto hidden shrink-0 space-y-4 border-t border-white/10 px-5 py-5 md:block">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-citrus font-display text-sm font-semibold text-ink">
              {initials(user?.firstName, user?.lastName, user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tracking-tight text-paper">{displayName}</p>
              {user?.email ? <p className="truncate text-[11px] text-paper/45">{user.email}</p> : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-1">
            <LanguageSwitcher className="text-paper/50 hover:text-citrus" compact />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/45 transition hover:text-citrus"
              onClick={async () => {
                await dispatch(logoutUser());
                navigate("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex h-dvh min-w-0 max-w-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain pt-[8.25rem] md:ml-[272px] md:pt-0">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 90% -10%, rgba(159,198,91,0.16), transparent 50%), radial-gradient(ellipse 45% 30% at 0% 30%, rgba(18,53,43,0.05), transparent 55%)",
          }}
        />
        <div className="relative min-w-0 max-w-full flex-1">{children}</div>
        <footer className="relative border-t border-border/80 bg-paper/80 px-5 py-5 text-xs text-muted-foreground backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="font-display text-sm font-semibold tracking-tight text-ink">
              DOMINA
            </p>
            <p className="uppercase tracking-[0.16em]">{t("common.tagline")}</p>
            <Link to="/" className="font-semibold text-primary transition hover:text-ink">
              {t("common.back")}
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
