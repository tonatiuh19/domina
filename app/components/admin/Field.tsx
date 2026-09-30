import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Admin form field with fixed label band so multi-column rows keep inputs aligned. */
export function Field({
  id,
  label,
  legend,
  error,
  className,
  children,
}: {
  id?: string;
  label: string;
  legend?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="flex min-h-[2.75rem] items-end leading-snug">
        {label}
      </Label>
      {children}
      {legend ? <p className="text-[11px] leading-snug text-muted-foreground">{legend}</p> : null}
      {error ? <p className="text-[11px] leading-snug text-destructive">{error}</p> : null}
    </div>
  );
}
