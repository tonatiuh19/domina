import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMeta } from "@/components/site/PageMeta";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel,
  loading = false,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("mb-8 space-y-3", className)}>
        <PageMeta title={title} description={description} robots="noindex, nofollow" />
        {backTo ? <Skeleton className="h-5 w-28 rounded-md" /> : null}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48 rounded-md" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mb-8 space-y-3", className)}>
      <PageMeta title={title} description={description} robots="noindex, nofollow" />
      {backTo ? (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel || "Back"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink break-words sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function AdminPrimaryLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink/90",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function AdminSecondaryLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-ink transition hover:bg-secondary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
