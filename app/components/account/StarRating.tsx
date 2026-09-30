import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function StarRating({
  value,
  onChange,
  disabled = false,
  size = "md",
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(0);
  const active = hover || value;
  const iconClass = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-4 w-4" : "h-6 w-6";

  return (
    <div
      className="inline-flex items-center gap-1"
      role="radiogroup"
      aria-label={t("account.ratingLabel")}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((rating) => {
        const filled = rating <= active;
        return (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={t("account.ratingStar", { count: rating })}
            disabled={disabled}
            className={cn(
              "rounded-md p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-citrus/60",
              disabled ? "cursor-default opacity-70" : "hover:scale-110",
            )}
            onMouseEnter={() => !disabled && setHover(rating)}
            onFocus={() => !disabled && setHover(rating)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(rating)}
          >
            <Star
              className={cn(
                iconClass,
                "transition",
                filled ? "fill-citrus text-citrus" : "fill-transparent text-ink/25",
              )}
              strokeWidth={1.6}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
