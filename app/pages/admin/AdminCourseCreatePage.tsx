import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { Field } from "@/components/admin/Field";
import { COURSE_GALLERY_MAX, ImageDropzone } from "@/components/admin/ImageDropzone";
import { RichHtmlEditor } from "@/components/admin/RichHtmlEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  checkCourseSlug,
  createCourse,
  fetchCatalogOptions,
  uploadCourseCover,
  uploadCourseGalleryImage,
} from "@/store/slices/adminSlice";
import { cn } from "@/lib/utils";

type PreviewMode = "desktop" | "tablet" | "mobile";
type SlugStatus = "idle" | "checking" | "available" | "taken" | "error";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function CoursePreview({
  values,
  labels,
  coverPreview,
  mode,
}: {
  values: {
    title: string;
    promise: string;
    summary: string;
    descriptionHtml: string;
    priceCents: number;
    durationHours: number;
  };
  labels: { category: string; city: string };
  coverPreview: string | null;
  mode: PreviewMode;
}) {
  const { t } = useTranslation();
  const width = mode === "desktop" ? "100%" : mode === "tablet" ? "min(420px, 100%)" : "min(320px, 100%)";

  return (
    <div className="flex min-w-0 justify-center overflow-x-hidden">
      <div
        className="w-full overflow-hidden rounded-[1.5rem] border border-border bg-paper shadow-[0_24px_60px_-28px_rgba(18,53,43,0.35)] transition-all"
        style={{ width, maxWidth: "100%" }}
      >
        {coverPreview ? (
          <img src={coverPreview} alt="" className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="aspect-[16/10] bg-gradient-to-br from-ink via-[#1a4a3c] to-citrus/40" />
        )}
        <div className="space-y-3 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {labels.category || "—"} · {labels.city || "—"}
          </p>
          <h3 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {values.title || t("admin.previewTitleFallback")}
          </h3>
          <p className="text-sm text-muted-foreground">{values.promise || t("admin.previewPromiseFallback")}</p>
          <p className="text-sm leading-6 text-ink/80">{values.summary || t("admin.previewSummaryFallback")}</p>
          {values.descriptionHtml?.trim() ? (
            <div
              className="prose prose-sm max-w-none text-ink/80"
              dangerouslySetInnerHTML={{ __html: values.descriptionHtml }}
            />
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span>
              {values.durationHours || 4}h · {formatMoney(Number(values.priceCents) || 0, "MXN")}
            </span>
            <span className="font-semibold text-primary">{t("course.reserve")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminCourseCreatePage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const saving = useAppSelector((state) => state.admin.saving);
  const error = useAppSelector((state) => state.admin.error);
  const catalog = useAppSelector((state) => state.admin.catalog);
  const [preview, setPreview] = useState<PreviewMode>("desktop");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [slugLocked, setSlugLocked] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugSuggested, setSlugSuggested] = useState<string | null>(null);
  const slugCheckSeq = useRef(0);

  const form = useFormik({
    initialValues: {
      title: "",
      slug: "",
      categoryId: 0,
      audienceId: 0,
      levelId: 0,
      cityId: 0,
      summary: "",
      promise: "",
      descriptionHtml: "",
      durationHours: 4,
      capacity: 15,
      priceCents: 150000,
      minEnrollment: 8,
      status: "draft",
      runOfShow: "",
      materials: "",
      safetyNotes: "",
    },
    validationSchema: Yup.object({
      title: Yup.string().trim().min(3).max(200).required(t("common.required")),
      slug: Yup.string()
        .trim()
        .matches(/^[a-z0-9-]*$/, t("admin.slugLegend"))
        .max(160),
      categoryId: Yup.number().integer().min(1).required(t("common.required")),
      audienceId: Yup.number().integer().min(1).required(t("common.required")),
      levelId: Yup.number().integer().min(1).required(t("common.required")),
      cityId: Yup.number().integer().min(1).required(t("common.required")),
      summary: Yup.string().trim().min(8).required(t("common.required")),
      promise: Yup.string().trim().min(4).max(320).required(t("common.required")),
      descriptionHtml: Yup.string().max(200_000),
      durationHours: Yup.number().positive().max(40).required(),
      capacity: Yup.number().integer().min(1).max(80).required(),
      priceCents: Yup.number().integer().min(0).required(),
      minEnrollment: Yup.number().integer().min(1).required(),
      runOfShow: Yup.string().max(20_000),
      materials: Yup.string().max(20_000),
      safetyNotes: Yup.string().max(20_000),
    }),
    onSubmit: async (values) => {
      setUploadNote(null);
      const buildBody = (slug: string) => ({
        ...values,
        slug,
        categoryId: Number(values.categoryId),
        audienceId: Number(values.audienceId),
        levelId: Number(values.levelId),
        cityId: Number(values.cityId),
        descriptionHtml: values.descriptionHtml || null,
        runOfShow: values.runOfShow || null,
        materials: values.materials || null,
        safetyNotes: values.safetyNotes || null,
        durationHours: Number(values.durationHours),
        capacity: Number(values.capacity),
        priceCents: Number(values.priceCents),
        minEnrollment: Number(values.minEnrollment),
      });

      const preferredSlug = values.slug.trim() || slugify(values.title);
      let result = await dispatch(createCourse(buildBody(preferredSlug)));

      if (createCourse.rejected.match(result)) {
        const payload = result.payload as { message?: string; suggested?: string } | undefined;
        if (payload?.suggested && payload.suggested !== preferredSlug) {
          setSlugLocked(true);
          void form.setFieldValue("slug", payload.suggested);
          setSlugSuggested(null);
          setSlugStatus("available");
          result = await dispatch(createCourse(buildBody(payload.suggested)));
        }
      }

      if (!createCourse.fulfilled.match(result)) return;

      const courseId = result.payload.id;
      if (coverFile) {
        setUploadNote(t("admin.uploadingCover"));
        const cover = await dispatch(uploadCourseCover({ id: courseId, file: coverFile }));
        if (uploadCourseCover.rejected.match(cover)) {
          setUploadNote(t("admin.createSavedUploadFailed"));
          navigate(`/admin/cursos/${courseId}`);
          return;
        }
      }
      if (galleryFiles.length) {
        setUploadNote(t("admin.uploadingGallery"));
        for (const file of galleryFiles.slice(0, COURSE_GALLERY_MAX)) {
          const uploaded = await dispatch(uploadCourseGalleryImage({ id: courseId, file }));
          if (uploadCourseGalleryImage.rejected.match(uploaded)) {
            setUploadNote(t("admin.createSavedUploadFailed"));
            navigate(`/admin/cursos/${courseId}`);
            return;
          }
        }
      }
      navigate(`/admin/cursos/${courseId}`);
    },
  });

  useEffect(() => {
    void dispatch(fetchCatalogOptions({ kind: "categories" }));
    void dispatch(fetchCatalogOptions({ kind: "levels" }));
    void dispatch(fetchCatalogOptions({ kind: "audiences" }));
    void dispatch(fetchCatalogOptions({ kind: "cities" }));
  }, [dispatch]);

  useEffect(() => {
    const pickDefault = (
      kind: "categories" | "levels" | "audiences" | "cities",
      field: "categoryId" | "levelId" | "audienceId" | "cityId",
      preferredSlug: string,
    ) => {
      if (Number(form.values[field]) > 0) return;
      const active = catalog[kind].filter((option) => option.isActive);
      const preferred = active.find((option) => option.slug === preferredSlug) || active[0];
      if (preferred) void form.setFieldValue(field, preferred.id);
    };
    pickDefault("categories", "categoryId", "tech");
    pickDefault("levels", "levelId", "intro");
    pickDefault("audiences", "audienceId", "open");
    pickDefault("cities", "cityId", "guadalajara");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once options arrive
  }, [catalog.categories, catalog.levels, catalog.audiences, catalog.cities]);

  useEffect(() => {
    const title = form.values.title.trim();
    const slugValue = form.values.slug.trim();
    const candidate = slugValue || slugify(title);
    if (!candidate) {
      setSlugStatus("idle");
      setSlugSuggested(null);
      return;
    }

    setSlugStatus("checking");
    const seq = ++slugCheckSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await dispatch(
          checkCourseSlug(slugValue ? { slug: slugValue } : { title }),
        );
        if (seq !== slugCheckSeq.current) return;
        if (!checkCourseSlug.fulfilled.match(result)) {
          setSlugStatus("error");
          return;
        }
        const { available, suggested, requested } = result.payload;
        setSlugSuggested(available ? null : suggested);
        setSlugStatus(available ? "available" : "taken");

        if (!slugLocked) {
          const nextSlug = available ? requested : suggested;
          if (nextSlug && nextSlug !== form.values.slug) {
            void form.setFieldValue("slug", nextSlug);
            if (!available) setSlugStatus("available");
          }
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
    // formik helpers are stable enough; depend on the values that drive the check
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on title/slug + lock only
  }, [dispatch, form.values.title, form.values.slug, slugLocked]);

  const previewModes = useMemo(
    () =>
      [
        { id: "desktop" as const, icon: Monitor, label: t("admin.previewDesktop") },
        { id: "tablet" as const, icon: Tablet, label: t("admin.previewTablet") },
        { id: "mobile" as const, icon: Smartphone, label: t("admin.previewMobile") },
      ] as const,
    [t],
  );

  const setCover = (files: File[]) => {
    const file = files[0] || null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const addGallery = (files: File[]) => {
    setGalleryFiles((current) => {
      const next = [...current, ...files].slice(0, COURSE_GALLERY_MAX);
      setGalleryPreviews(next.map((file) => URL.createObjectURL(file)));
      return next;
    });
  };

  const slugLegend =
    slugStatus === "checking"
      ? t("admin.slugChecking")
      : slugStatus === "available"
        ? t("admin.slugAvailable")
        : slugStatus === "taken"
          ? t("admin.slugTaken", { suggested: slugSuggested || "" })
          : slugStatus === "error"
            ? t("admin.slugCheckError")
            : t("admin.slugLegend");

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.createCourse")} description={t("admin.createCourseBody")} backTo="/admin/cursos" backLabel={t("admin.goBackCourses")} />

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <form className="min-w-0 space-y-5 rounded-2xl border border-border bg-paper p-4 sm:p-6" onSubmit={form.handleSubmit}>
          <Field
            id="title"
            label={t("admin.courseTitle")}
            legend={t("admin.titleLegend")}
            error={form.touched.title && form.errors.title ? String(form.errors.title) : undefined}
          >
            <Input
              id="title"
              {...form.getFieldProps("title")}
              onChange={(event) => {
                const nextTitle = event.target.value;
                void form.setFieldValue("title", nextTitle);
                if (!slugLocked) {
                  void form.setFieldValue("slug", slugify(nextTitle));
                }
              }}
            />
          </Field>

          <Field
            id="slug"
            label={t("admin.slug")}
            legend={slugLegend}
            error={form.touched.slug && form.errors.slug ? String(form.errors.slug) : undefined}
          >
            <div className="space-y-2">
              <Input
                id="slug"
                {...form.getFieldProps("slug")}
                onChange={(event) => {
                  setSlugLocked(true);
                  void form.setFieldValue("slug", slugify(event.target.value));
                }}
                className={cn(
                  slugStatus === "taken" && "border-destructive",
                  slugStatus === "available" && "border-primary/50",
                )}
              />
              <div className="flex flex-wrap gap-2">
                {slugStatus === "taken" && slugSuggested ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSlugLocked(true);
                      void form.setFieldValue("slug", slugSuggested);
                      setSlugStatus("available");
                      setSlugSuggested(null);
                    }}
                  >
                    {t("admin.slugUseSuggested", { suggested: slugSuggested })}
                  </Button>
                ) : null}
                {slugLocked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSlugLocked(false);
                      void form.setFieldValue("slug", slugify(form.values.title));
                    }}
                  >
                    {t("admin.slugFollowTitle")}
                  </Button>
                ) : null}
              </div>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field id="categoryId" label={t("admin.category")} legend={t("admin.categoryLegend")}>
              <select
                id="categoryId"
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                {...form.getFieldProps("categoryId")}
              >
                {catalog.categories
                  .filter((option) => option.isActive)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="levelId" label={t("admin.level")} legend={t("admin.levelLegend")}>
              <select
                id="levelId"
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                {...form.getFieldProps("levelId")}
              >
                {catalog.levels
                  .filter((option) => option.isActive)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="audienceId" label={t("admin.audience")} legend={t("admin.audienceLegend")}>
              <select
                id="audienceId"
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                {...form.getFieldProps("audienceId")}
              >
                {catalog.audiences
                  .filter((option) => option.isActive)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="status" label={t("admin.status")} legend={t("admin.statusLegend")}>
              <select id="status" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm" {...form.getFieldProps("status")}>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </Field>
          </div>

          <Field
            id="promise"
            label={t("admin.promise")}
            legend={t("admin.promiseLegend")}
            error={form.touched.promise && form.errors.promise ? String(form.errors.promise) : undefined}
          >
            <Input id="promise" maxLength={320} {...form.getFieldProps("promise")} />
          </Field>

          <Field
            id="summary"
            label={t("admin.summary")}
            legend={t("admin.summaryLegend")}
            error={form.touched.summary && form.errors.summary ? String(form.errors.summary) : undefined}
          >
            <Textarea id="summary" rows={3} {...form.getFieldProps("summary")} />
          </Field>

          <Field label={t("admin.description")} legend={t("admin.descriptionLegend")}>
            <RichHtmlEditor
              value={form.values.descriptionHtml}
              onChange={(html) => void form.setFieldValue("descriptionHtml", html)}
              placeholder={t("admin.descriptionHint")}
              label={t("admin.description")}
            />
          </Field>

          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field id="priceCents" label={t("admin.priceCents")} legend={t("admin.priceCentsLegend")}>
              <Input id="priceCents" type="number" min={0} step={1} {...form.getFieldProps("priceCents")} />
            </Field>
            <Field id="durationHours" label={t("admin.durationHours")} legend={t("admin.durationHoursLegend")}>
              <Input id="durationHours" type="number" min={0.5} max={40} step={0.5} {...form.getFieldProps("durationHours")} />
            </Field>
            <Field id="capacity" label={t("admin.capacity")} legend={t("admin.capacityLegend")}>
              <Input id="capacity" type="number" min={1} max={80} step={1} {...form.getFieldProps("capacity")} />
            </Field>
            <Field id="minEnrollment" label={t("admin.minimum")} legend={t("admin.minimumLegend")}>
              <Input id="minEnrollment" type="number" min={1} step={1} {...form.getFieldProps("minEnrollment")} />
            </Field>
          </div>

          <Field id="cityId" label={t("admin.city")} legend={t("admin.cityLegend")}>
            <select
              id="cityId"
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
              {...form.getFieldProps("cityId")}
            >
              {catalog.cities
                .filter((option) => option.isActive)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </Field>

          <Field id="runOfShow" label={t("admin.run")} legend={t("admin.runLegend")}>
            <Textarea id="runOfShow" rows={3} {...form.getFieldProps("runOfShow")} />
          </Field>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field id="materials" label={t("admin.materials")} legend={t("admin.materialsLegend")}>
              <Textarea id="materials" rows={3} {...form.getFieldProps("materials")} />
            </Field>
            <Field id="safetyNotes" label={t("admin.safety")} legend={t("admin.safetyLegend")}>
              <Textarea id="safetyNotes" rows={3} {...form.getFieldProps("safetyNotes")} />
            </Field>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("admin.cover")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("admin.cdnHint")}</p>
            <ImageDropzone
              id="coverImage"
              legend={t("admin.coverLegend", { mb: "4.5" })}
              onFiles={setCover}
              disabled={saving}
            >
              {coverPreview ? (
                <div className="relative inline-block">
                  <img src={coverPreview} alt="" className="h-28 w-44 rounded-md object-cover" />
                  <button
                    type="button"
                    className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-paper"
                    onClick={() => setCover([])}
                    aria-label={t("admin.galleryRemove")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </ImageDropzone>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("admin.gallery")}</p>
            <ImageDropzone
              id="galleryImages"
              multiple
              maxFiles={Math.max(1, COURSE_GALLERY_MAX - galleryFiles.length)}
              legend={t("admin.galleryLegend", { count: COURSE_GALLERY_MAX, mb: "4.5" })}
              onFiles={addGallery}
              disabled={saving || galleryFiles.length >= COURSE_GALLERY_MAX}
            >
              {galleryPreviews.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {galleryPreviews.map((src, index) => (
                    <div key={`${src}-${index}`} className="relative">
                      <img src={src} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-ink/80 p-1 text-paper"
                        onClick={() => {
                          setGalleryFiles((current) => current.filter((_, i) => i !== index));
                          setGalleryPreviews((current) => current.filter((_, i) => i !== index));
                        }}
                        aria-label={t("admin.galleryRemove")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {t("admin.galleryCount", { used: galleryFiles.length, max: COURSE_GALLERY_MAX })}
              </p>
            </ImageDropzone>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {uploadNote ? <p className="text-sm text-muted-foreground">{uploadNote}</p> : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={saving || slugStatus === "checking" || slugStatus === "taken"}>
              {saving || uploadNote ? t("common.loading") : t("admin.createCourse")}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/admin/cursos")}>
              {t("common.close")}
            </Button>
          </div>
        </form>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex flex-wrap gap-2">
            {previewModes.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreview(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition",
                  preview === id ? "bg-ink text-paper" : "bg-secondary text-muted-foreground hover:text-ink",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="min-w-0 overflow-x-hidden rounded-2xl border border-dashed border-border/80 bg-card/50 p-4 sm:p-6">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("admin.livePreview")}
            </p>
            <CoursePreview
              values={form.values}
              labels={{
                category:
                  catalog.categories.find((option) => option.id === Number(form.values.categoryId))?.label || "",
                city: catalog.cities.find((option) => option.id === Number(form.values.cityId))?.label || "",
              }}
              coverPreview={coverPreview}
              mode={preview}
            />
          </div>
        </div>
      </div>
    </AdminSection>
  );
}
