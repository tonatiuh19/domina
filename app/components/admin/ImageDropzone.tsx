import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const COURSE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const COURSE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const COURSE_IMAGE_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
export const COURSE_GALLERY_MAX = 12;

function isAllowedImage(file: File) {
  if (COURSE_IMAGE_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp");
}

export function ImageDropzone({
  id,
  multiple = false,
  maxFiles = 1,
  maxBytes = COURSE_IMAGE_MAX_BYTES,
  disabled = false,
  legend,
  onFiles,
  children,
  className,
}: {
  id?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  disabled?: boolean;
  legend?: ReactNode;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const acceptFiles = (incoming: FileList | File[] | null) => {
    if (!incoming || disabled) return;
    const list = Array.from(incoming);
    if (!list.length) return;

    const valid: File[] = [];
    for (const file of list) {
      if (!isAllowedImage(file)) {
        setLocalError(t("admin.imageTypeError"));
        return;
      }
      if (file.size > maxBytes) {
        setLocalError(t("admin.imageSizeError"));
        return;
      }
      valid.push(file);
    }

    const capped = valid.slice(0, maxFiles);
    if (valid.length > maxFiles) {
      setLocalError(t("admin.imageCountError", { count: maxFiles }));
    } else {
      setLocalError(null);
    }
    onFiles(capped);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex min-h-[9.5rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center transition",
          dragging ? "border-ink bg-ink/5" : "border-border bg-card/70 hover:border-ink/40 hover:bg-card",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-ink">
          <Upload className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">
            {dragging ? t("admin.dropImagesHere") : t("admin.dragOrBrowse")}
          </p>
          {legend ? <p className="max-w-sm text-[11px] leading-snug text-muted-foreground">{legend}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {multiple ? t("admin.chooseImages") : t("admin.chooseImage")}
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={COURSE_IMAGE_ACCEPT}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => acceptFiles(event.target.files)}
        />
      </div>
      {localError ? <p className="text-[11px] text-destructive">{localError}</p> : null}
      {children}
    </div>
  );
}
