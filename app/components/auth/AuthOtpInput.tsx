import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/** Six-box OTP entry with paste fill + auto-complete. */
export function AuthOtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  "aria-label": ariaLabel = "Verification code",
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const completedRef = useRef("");
  const groupId = useId();

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const emitComplete = (code: string) => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return;
    if (completedRef.current === code) return;
    completedRef.current = code;
    onComplete?.(code);
  };

  const applyCode = (nextValue: string, focusAt?: number) => {
    const code = nextValue.replace(/\D/g, "").slice(0, 6);
    onChange(code);
    if (typeof focusAt === "number") {
      refs.current[Math.min(Math.max(focusAt, 0), 5)]?.focus();
    }
    if (code.length === 6) emitComplete(code);
    else completedRef.current = "";
  };

  const setDigit = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      const next = digits.slice();
      next[index] = "";
      applyCode(next.join(""), index);
      return;
    }
    if (cleaned.length > 1) {
      applyCode(cleaned, Math.min(cleaned.length, 5));
      return;
    }
    const next = digits.slice();
    next[index] = cleaned;
    applyCode(next.join(""), index < 5 ? index + 1 : index);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-1 sm:gap-2.5"
    >
      {digits.map((digit, index) => {
        const filled = Boolean(digit);
        return (
          <input
            key={`${groupId}-${index}`}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit}
            aria-label={`${ariaLabel} digit ${index + 1}`}
            onChange={(event) => setDigit(index, event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                if (digits[index]) {
                  event.preventDefault();
                  setDigit(index, "");
                  return;
                }
                if (index > 0) {
                  event.preventDefault();
                  refs.current[index - 1]?.focus();
                  setDigit(index - 1, "");
                }
                return;
              }
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                refs.current[index - 1]?.focus();
              }
              if (event.key === "ArrowRight" && index < 5) {
                event.preventDefault();
                refs.current[index + 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              applyCode(event.clipboardData.getData("text"), 5);
            }}
            className={cn(
              "h-12 w-full min-w-0 max-w-[2.75rem] rounded-xl border bg-card text-center font-display text-lg font-semibold tracking-tight text-ink outline-none transition duration-200 sm:h-14 sm:max-w-[3.25rem] sm:rounded-2xl sm:text-xl",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
              filled
                ? "border-ink/25 bg-ink/[0.04] scale-[1.02]"
                : "border-border",
              "focus:border-ink focus:bg-paper focus:ring-4 focus:ring-citrus/25 focus:scale-[1.04]",
              "disabled:cursor-not-allowed disabled:opacity-55",
            )}
          />
        );
      })}
    </div>
  );
}
