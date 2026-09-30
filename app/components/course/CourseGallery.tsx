import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CourseGalleryImage } from "@shared/api";
import { cn } from "@/lib/utils";

export function CourseGallery({ images }: { images: CourseGalleryImage[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  if (!images.length) return null;

  const activeImage = active == null ? null : images[active];

  return (
    <section className="mt-10" aria-labelledby="course-gallery-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("course.galleryEyebrow")}</p>
          <h2 id="course-gallery-heading" className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {t("course.gallery")}
          </h2>
        </div>
        <p className="max-w-full text-xs text-muted-foreground sm:max-w-[14rem] sm:text-right">{t("course.galleryHint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setActive(index)}
            className={cn(
              "group relative overflow-hidden rounded-xl bg-secondary text-left",
              index === 0 ? "col-span-2 aspect-[16/10] md:col-span-2 md:row-span-2 md:aspect-auto md:min-h-[280px]" : "aspect-[4/3]",
            )}
          >
            <img
              src={image.imageUrl}
              alt={image.caption || ""}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent opacity-80" />
            {image.caption ? (
              <span className="absolute bottom-3 left-3 right-3 text-sm font-medium text-paper drop-shadow">
                {image.caption}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeImage ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0"
            aria-label={t("common.close")}
            onClick={() => setActive(null)}
          />
          <div className="relative z-[1] w-full max-w-4xl overflow-hidden rounded-2xl bg-paper shadow-2xl">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute right-3 top-3 z-[2] rounded-full bg-ink/70 p-2 text-paper"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
            <img src={activeImage.imageUrl} alt={activeImage.caption || ""} className="max-h-[78vh] w-full object-contain bg-ink" />
            {activeImage.caption ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{activeImage.caption}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
