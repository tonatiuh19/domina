import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PageMeta } from "@/components/site/PageMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchAdminMe, logoutAdmin } from "@/store/slices/adminAuthSlice";
import { cn } from "@/lib/utils";

const NAV_KEY = "domina.adminNavCollapsed";

function NavSkeleton() {
  return (
    <div className="space-y-2 px-3" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-xl bg-white/10" />
      ))}
    </div>
  );
}

type NavSection = {
  title: string;
  links: ReadonlyArray<{
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    end: boolean;
  }>;
};

function AdminNav({
  sections,
  collapsed,
  loadingMe,
  onNavigate,
}: {
  sections: NavSection[];
  collapsed: boolean;
  loadingMe: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {loadingMe ? (
        <NavSkeleton />
      ) : (
        sections.map((section) => (
          <div key={section.title}>
            {!collapsed ? (
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/35">
                {section.title}
              </p>
            ) : null}
            <div className="space-y-1">
              {section.links.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      collapsed && "justify-center px-2",
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
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
                          isActive ? "bg-ink/10 text-ink" : "bg-white/5 text-paper/55 group-hover:text-citrus",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.1} aria-hidden />
                      </span>
                      {!collapsed ? <span className="truncate">{label}</span> : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))
      )}
    </nav>
  );
}

function AdminAccountCard({
  collapsed,
  loadingMe,
  email,
  companyName,
  role,
  onSignOut,
}: {
  collapsed: boolean;
  loadingMe: boolean;
  email?: string | null;
  companyName?: string | null;
  role?: string | null;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("relative mt-auto border-t border-white/10 px-4 py-4", collapsed && "px-2")}>
      {loadingMe ? (
        <Skeleton className="h-16 w-full rounded-2xl bg-white/10" />
      ) : (
        <div className={cn("rounded-2xl bg-white/5 p-3 ring-1 ring-white/10", collapsed && "p-2")}>
          {!collapsed ? (
            <>
              <p className="truncate text-sm font-semibold text-paper">{companyName || email}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-paper/45">{role}</p>
            </>
          ) : (
            <p className="text-center text-[10px] uppercase tracking-[0.12em] text-paper/45">{role?.slice(0, 3)}</p>
          )}
          <div className={cn("mt-3 flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
            <LanguageSwitcher className="text-paper/50 hover:text-citrus" compact />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/45 transition hover:text-citrus"
              onClick={onSignOut}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {!collapsed ? t("common.signOut") : null}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAppSelector((state) => state.adminAuth.token);
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(NAV_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (token) void dispatch(fetchAdminMe());
  }, [dispatch, token]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  if (!token) return <Navigate to="/acceso/equipo" replace />;

  const isCompany = admin?.role === "company";
  if (admin && isCompany && !location.pathname.startsWith("/admin/empresas")) {
    return <Navigate to="/admin/empresas" replace />;
  }
  if (admin && !isCompany && location.pathname.startsWith("/admin/empresas")) {
    return <Navigate to="/admin" replace />;
  }

  const loadingMe = Boolean(token && !admin);

  const opsLinks = [
    { to: "/admin", label: t("admin.dashboard"), icon: LayoutDashboard, end: true },
    { to: "/admin/cursos", label: t("admin.courses"), icon: BookOpen, end: false },
    { to: "/admin/participantes", label: t("admin.participants"), icon: Users, end: false },
    { to: "/admin/pagos", label: t("admin.payments"), icon: CreditCard, end: false },
  ] as const;

  const contentLinks = [{ to: "/admin/legal", label: t("admin.legal"), icon: Scale, end: false }] as const;

  const teamLinks = [{ to: "/admin/equipo", label: t("admin.team"), icon: UsersRound, end: false }] as const;

  const companyLinks = [
    { to: "/admin/empresas", label: t("companyPortal.title"), icon: Building2, end: false },
  ] as const;

  const sections: NavSection[] = isCompany
    ? [{ title: t("nav.companies"), links: companyLinks }]
    : [
        { title: t("admin.navOps"), links: opsLinks },
        { title: t("admin.navContent"), links: contentLinks },
        { title: t("admin.navTeam"), links: teamLinks },
      ];

  const signOut = async () => {
    await dispatch(logoutAdmin());
    navigate("/");
  };

  const homeTo = isCompany ? "/admin/empresas" : "/admin";

  return (
    <div className="portal-shell flex h-dvh max-w-[100vw] overflow-hidden bg-[hsl(42_28%_95%)]">
      <PageMeta title={t("admin.dashboard")} description={t("seo.adminDescription")} robots="noindex, nofollow" />
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-white/5 bg-ink text-paper transition-[width] duration-200 lg:flex",
          collapsed ? "w-[84px]" : "w-[272px]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 0% 0%, rgba(159,198,91,0.22), transparent 52%), radial-gradient(ellipse 70% 45% at 100% 100%, rgba(255,255,255,0.06), transparent 55%)",
          }}
        />

        <div className={cn("relative flex items-center gap-2 px-4 pb-4 pt-6", collapsed ? "justify-center" : "justify-between")}>
          <Link to={homeTo} className="font-display text-xl font-semibold tracking-tight">
            {collapsed ? "D" : "DOMINA"}
          </Link>
          <button
            type="button"
            className="rounded-lg p-1.5 text-paper/50 transition hover:bg-white/5 hover:text-citrus"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? t("admin.expandNav") : t("admin.collapseNav")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <AdminNav sections={sections} collapsed={collapsed} loadingMe={loadingMe} />
        <AdminAccountCard
          collapsed={collapsed}
          loadingMe={loadingMe}
          email={admin?.email}
          companyName={admin?.companyName}
          role={admin?.role}
          onSignOut={() => void signOut()}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("admin.expandNav")}>
          <button
            type="button"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            aria-label={t("common.close")}
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-dvh w-[min(100vw-3rem,272px)] max-w-full flex-col overflow-hidden bg-ink text-paper shadow-[0_24px_80px_rgba(18,35,27,0.4)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background:
                  "radial-gradient(ellipse 90% 55% at 0% 0%, rgba(159,198,91,0.22), transparent 52%), radial-gradient(ellipse 70% 45% at 100% 100%, rgba(255,255,255,0.06), transparent 55%)",
              }}
            />
            <div className="relative flex items-center justify-between gap-2 px-4 pb-4 pt-6">
              <Link to={homeTo} className="font-display text-xl font-semibold tracking-tight" onClick={() => setMobileOpen(false)}>
                DOMINA
              </Link>
              <button
                type="button"
                className="rounded-lg p-1.5 text-paper/50 transition hover:bg-white/5 hover:text-citrus"
                onClick={() => setMobileOpen(false)}
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <AdminNav sections={sections} collapsed={false} loadingMe={loadingMe} onNavigate={() => setMobileOpen(false)} />
            <AdminAccountCard
              collapsed={false}
              loadingMe={loadingMe}
              email={admin?.email}
              companyName={admin?.companyName}
              role={admin?.role}
              onSignOut={() => void signOut()}
            />
          </aside>
        </div>
      ) : null}

      <div className="relative flex min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 90% -10%, rgba(159,198,91,0.16), transparent 50%), radial-gradient(ellipse 45% 30% at 0% 30%, rgba(18,53,43,0.05), transparent 55%)",
          }}
        />

        <header className="relative sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-[hsl(42_28%_95%/0.92)] px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-paper text-ink transition hover:bg-secondary"
            onClick={() => setMobileOpen(true)}
            aria-label={t("admin.expandNav")}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to={homeTo} className="font-display text-lg font-semibold tracking-tight text-ink">
            DOMINA
          </Link>
        </header>

        <div className="relative min-w-0 flex-1 px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminSection({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full min-w-0 max-w-6xl">{children}</section>;
}
