import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Soft brand shimmer — paper / citrus, not generic gray pulse. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("domina-skeleton", className)} style={style} aria-hidden />;
}

export function CourseDetailSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[1.2fr_.8fr]" aria-busy="true" aria-live="polite">
      <div>
        <Skeleton className="mb-6 aspect-[16/9] w-full rounded-lg" />
        <Skeleton className="h-3 w-40 rounded-full" />
        <Skeleton className="mt-4 h-12 w-[80%] max-w-md rounded-md" />
        <Skeleton className="mt-5 h-6 w-[75%] max-w-lg rounded-md" />
        <Skeleton className="mt-3 h-16 w-full max-w-xl rounded-md" />
        <div className="mt-8 grid grid-cols-1 gap-4 border-y border-border py-5 min-[380px]:grid-cols-3">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
      </div>
      <aside className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </aside>
    </div>
  );
}

export function CatalogListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mt-8 divide-y divide-border border-y border-border" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid gap-4 py-6 md:grid-cols-[120px_140px_1fr_140px] md:items-center">
          <Skeleton className="h-20 w-full rounded-md md:h-24" />
          <Skeleton className="h-3 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-[66%] rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
          </div>
          <div className="space-y-2 md:justify-self-end">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountHomeSkeleton() {
  return (
    <div className="mt-8 space-y-8" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="divide-y divide-border border-y border-border">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="grid gap-3 py-4 md:grid-cols-[1fr_160px_140px]">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}

export function AccountPaySkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-busy="true">
      <Skeleton className="h-5 w-56 rounded-md" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  );
}

export function AdminCardsSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

export function CatalogOptionsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className={`space-y-3 rounded-xl border border-border bg-card/50 p-4 ${index === 4 ? "lg:col-span-2" : ""}`}
        >
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-3 w-48 rounded-full" />
          <div className="space-y-2 pt-1">
            {Array.from({ length: index === 2 ? 4 : 3 }).map((__, row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-paper px-3 py-2.5"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-2.5 w-24 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
          <div className={`grid gap-2 pt-1 ${index === 4 ? "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]"}`}>
            <Skeleton className="h-11 rounded-md" />
            <Skeleton className="h-11 rounded-md" />
            {index === 4 ? <Skeleton className="h-11 rounded-md" /> : null}
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
