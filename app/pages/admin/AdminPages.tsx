import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminCardsSkeleton, Skeleton } from "@/components/ui/skeleton";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { Field } from "@/components/admin/Field";
import { COURSE_GALLERY_MAX, ImageDropzone } from "@/components/admin/ImageDropzone";
import { RichHtmlEditor } from "@/components/admin/RichHtmlEditor";
import { PageMeta } from "@/components/site/PageMeta";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createEdition,
  deleteCourseGalleryImage,
  fetchAdminCourse,
  fetchAdminDashboard,
  fetchPayments,
  fetchTeam,
  inviteStaff,
  saveCourse,
  saveEdition,
  saveEnrollment,
  updateStaff,
  uploadCourseCover,
  uploadCourseGalleryImage,
  fetchCatalogOptions,
  type AdminListQuery,
  type PaymentRow,
} from "@/store/slices/adminSlice";
import { fetchAdminPage, fetchAdminPages, saveAdminPage } from "@/store/slices/siteSlice";
import { createCompanyRequest, fetchCompanyRequests } from "@/store/slices/companySlice";
import type { AdminProfile } from "@shared/api";

export { AdminLayout } from "@/components/admin/AdminShell";
export { AdminCoursesPage as AdminCourses } from "@/pages/admin/AdminCoursesPage";
export { AdminCourseCreatePage as AdminCourseCreate } from "@/pages/admin/AdminCourseCreatePage";
export { AdminCatalogPage as AdminCatalog } from "@/pages/admin/AdminCatalogPage";
export { AdminParticipantsPage as AdminParticipants } from "@/pages/admin/AdminParticipantsPage";

export function AdminHome() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const { stats, upcoming, error, loading } = useAppSelector((state) => state.admin);

  useEffect(() => {
    if (admin?.role === "company") return;
    void dispatch(fetchAdminDashboard());
  }, [admin?.role, dispatch]);

  if (admin?.role === "company") return <Navigate to="/admin/empresas" replace />;

  const cards = [
    [t("admin.published"), stats?.publishedCourses],
    [t("admin.upcoming"), stats?.upcomingEditions],
    [t("admin.seats"), stats?.paidSeats],
    [t("admin.revenue"), stats ? formatMoney(stats.revenueCents) : "—"],
    [t("admin.requests"), stats?.openRequests],
  ];

  return (
    <section>
      <PageMeta title={t("admin.dashboard")} description={t("seo.adminDescription")} robots="noindex, nofollow" />
      <h1 className="font-display text-4xl font-semibold">{t("admin.dashboard")}</h1>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {loading ? <AdminCardsSkeleton /> : null}
      {!loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
              <p className="mt-2 font-display text-3xl font-semibold">{value ?? "—"}</p>
            </div>
          ))}
        </div>
      ) : null}
      {!loading ? (
        <div className="mt-8 divide-y divide-border border-y border-border">
          {upcoming.map((edition) => (
            <Link
              key={edition.id}
              to={`/admin/cursos/${edition.courseId}?editionId=${edition.id}`}
              className="grid gap-2 py-4 md:grid-cols-[1fr_180px_120px]"
            >
              <span className="font-semibold">{edition.courseTitle}</span>
              <span className="text-sm text-muted-foreground">
                {new Date(edition.startsAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <span className="text-sm">
                {edition.paidCount}/{edition.minEnrollment}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      )}
    </section>
  );
}

export function AdminCourse() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { course, editions, participants, editionId, feedback, error, saving } = useAppSelector((state) => state.admin);
  const catalog = useAppSelector((state) => state.admin.catalog);

  useEffect(() => {
    if (id) void dispatch(fetchAdminCourse({ id: Number(id) }));
  }, [dispatch, id]);

  useEffect(() => {
    void dispatch(fetchCatalogOptions({ kind: "categories" }));
    void dispatch(fetchCatalogOptions({ kind: "levels" }));
    void dispatch(fetchCatalogOptions({ kind: "audiences" }));
    void dispatch(fetchCatalogOptions({ kind: "cities" }));
    void dispatch(fetchCatalogOptions({ kind: "venues" }));
  }, [dispatch]);

  const form = useFormik({
    enableReinitialize: true,
    initialValues: {
      promise: course?.promise || "",
      summary: course?.summary || "",
      descriptionHtml: course?.descriptionHtml || "",
      status: course?.status || "draft",
      priceCents: course?.priceCents || 0,
      capacity: course?.capacity || 15,
      minEnrollment: course?.minEnrollment || 8,
      runOfShow: course?.runOfShow || "",
      materials: course?.materials || "",
      safetyNotes: course?.safetyNotes || "",
      categoryId: course?.categoryId || 0,
      audienceId: course?.audienceId || 0,
      levelId: course?.levelId || 0,
      cityId: course?.cityId || 0,
    },
    validationSchema: Yup.object({
      promise: Yup.string().required(t("common.required")),
      summary: Yup.string().required(t("common.required")),
      descriptionHtml: Yup.string().nullable(),
      status: Yup.string().required(),
      priceCents: Yup.number().min(0).required(),
      capacity: Yup.number().min(1).required(),
      minEnrollment: Yup.number().min(1).required(),
    }),
    onSubmit: async (values) => {
      const saved = await dispatch(
        saveCourse({
          id: Number(id),
          body: {
            ...values,
            descriptionHtml: values.descriptionHtml || null,
            priceCents: Number(values.priceCents),
            capacity: Number(values.capacity),
            minEnrollment: Number(values.minEnrollment),
            categoryId: Number(values.categoryId),
            audienceId: Number(values.audienceId),
            levelId: Number(values.levelId),
            cityId: Number(values.cityId),
          },
        }),
      );
      if (saveCourse.fulfilled.match(saved)) void dispatch(fetchAdminCourse({ id: Number(id), editionId: editionId || undefined }));
    },
  });

  const editionForm = useFormik({
    initialValues: {
      startsAt: "",
      endsAt: "",
      venueId: 0,
      capacity: course?.capacity || 15,
      priceCents: course?.priceCents || 0,
      minEnrollment: course?.minEnrollment || 8,
    },
    enableReinitialize: true,
    validationSchema: Yup.object({
      startsAt: Yup.string().required(t("common.required")),
      endsAt: Yup.string().required(t("common.required")),
      venueId: Yup.number().integer().min(1).required(t("common.required")),
      capacity: Yup.number().required(),
      priceCents: Yup.number().required(),
      minEnrollment: Yup.number().required(),
    }),
    onSubmit: async (values) => {
      const created = await dispatch(
        createEdition({
          courseId: Number(id),
          body: {
            startsAt: values.startsAt.replace("T", " "),
            endsAt: values.endsAt.replace("T", " "),
            venueId: Number(values.venueId),
            capacity: Number(values.capacity),
            priceCents: Number(values.priceCents),
            minEnrollment: Number(values.minEnrollment),
          },
        }),
      );
      if (createEdition.fulfilled.match(created)) void dispatch(fetchAdminCourse({ id: Number(id) }));
    },
  });

  useEffect(() => {
    if (Number(editionForm.values.venueId) > 0) return;
    const first = catalog.venues.find((venue) => venue.isActive);
    if (first) void editionForm.setFieldValue("venueId", first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.venues]);

  if (!course) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <AdminSection>
      <AdminPageHeader
        title={course.title}
        description={
          feedback.reviews
            ? `${feedback.averageRating} · ${feedback.reviews}`
            : `${course.categoryLabel || course.category} · ${course.city}`
        }
        backTo="/admin/cursos"
        backLabel={t("admin.goBackCourses")}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("admin.cover")}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{t("admin.cdnHint")}</p>
        <ImageDropzone
          id="coverImage"
          legend={t("admin.coverLegend", { mb: "4.5" })}
          disabled={saving}
          onFiles={async (files) => {
            const file = files[0];
            if (!file) return;
            const uploaded = await dispatch(uploadCourseCover({ id: Number(id), file }));
            if (uploadCourseCover.fulfilled.match(uploaded)) {
              void dispatch(fetchAdminCourse({ id: Number(id), editionId: editionId || undefined }));
            }
          }}
        >
          {course.coverImageUrl ? (
            <img src={course.coverImageUrl} alt="" className="h-28 w-44 rounded-md object-cover" />
          ) : null}
        </ImageDropzone>
      </div>

      <form className="grid items-start gap-4 lg:grid-cols-2" onSubmit={form.handleSubmit}>
        <Field
          id="promise"
          label={t("admin.promise")}
          legend={t("admin.promiseLegend")}
          className="lg:col-span-2"
        >
          <Input id="promise" maxLength={320} {...form.getFieldProps("promise")} />
        </Field>
        <Field
          id="summary"
          label={t("course.script")}
          legend={t("admin.summaryLegend")}
          className="lg:col-span-2"
        >
          <Textarea id="summary" {...form.getFieldProps("summary")} />
        </Field>
        <Field label={t("admin.description")} legend={t("admin.descriptionLegend")} className="lg:col-span-2">
          <RichHtmlEditor
            value={form.values.descriptionHtml}
            onChange={(html) => void form.setFieldValue("descriptionHtml", html)}
            placeholder={t("admin.descriptionHint")}
            label={t("admin.description")}
          />
        </Field>
        <Field id="status" label={t("admin.status")} legend={t("admin.statusLegend")}>
          <select id="status" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("status")}>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </Field>
        <Field id="categoryId" label={t("admin.category")} legend={t("admin.categoryLegend")}>
          <select id="categoryId" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("categoryId")}>
            {[...catalog.categories.filter((o) => o.isActive || o.id === course.categoryId)].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="levelId" label={t("admin.level")} legend={t("admin.levelLegend")}>
          <select id="levelId" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("levelId")}>
            {[...catalog.levels.filter((o) => o.isActive || o.id === course.levelId)].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="audienceId" label={t("admin.audience")} legend={t("admin.audienceLegend")}>
          <select id="audienceId" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("audienceId")}>
            {[...catalog.audiences.filter((o) => o.isActive || o.id === course.audienceId)].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="cityId" label={t("admin.city")} legend={t("admin.cityLegend")}>
          <select id="cityId" className="h-11 w-full rounded-md border border-input bg-card px-3" {...form.getFieldProps("cityId")}>
            {[...catalog.cities.filter((o) => o.isActive || o.id === course.cityId)].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="priceCents" label={t("admin.price")} legend={t("admin.priceCentsLegend")}>
          <Input id="priceCents" type="number" min={0} step={1} {...form.getFieldProps("priceCents")} />
        </Field>
        <Field id="capacity" label={t("admin.capacity")} legend={t("admin.capacityLegend")}>
          <Input id="capacity" type="number" min={1} max={80} step={1} {...form.getFieldProps("capacity")} />
        </Field>
        <Field id="minEnrollment" label={t("admin.minimum")} legend={t("admin.minimumLegend")}>
          <Input id="minEnrollment" type="number" min={1} step={1} {...form.getFieldProps("minEnrollment")} />
        </Field>
        <Field id="runOfShow" label={t("admin.run")} legend={t("admin.runLegend")} className="lg:col-span-2">
          <Textarea id="runOfShow" {...form.getFieldProps("runOfShow")} />
        </Field>
        <Field id="materials" label={t("admin.materials")} legend={t("admin.materialsLegend")}>
          <Textarea id="materials" {...form.getFieldProps("materials")} />
        </Field>
        <Field id="safetyNotes" label={t("admin.safety")} legend={t("admin.safetyLegend")}>
          <Textarea id="safetyNotes" {...form.getFieldProps("safetyNotes")} />
        </Field>
        <div className="lg:col-span-2">
          <Button type="submit" disabled={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t("admin.gallery")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("course.galleryHint")}</p>
        </div>
        <ImageDropzone
          id="galleryImage"
          multiple
          maxFiles={Math.max(1, COURSE_GALLERY_MAX - (course.gallery?.length || 0))}
          legend={t("admin.galleryLegend", { count: COURSE_GALLERY_MAX, mb: "4.5" })}
          disabled={saving || (course.gallery?.length || 0) >= COURSE_GALLERY_MAX}
          onFiles={async (files) => {
            for (const file of files) {
              await dispatch(uploadCourseGalleryImage({ id: Number(id), file }));
            }
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("admin.galleryCount", { used: course.gallery?.length || 0, max: COURSE_GALLERY_MAX })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(course.gallery || []).map((image) => (
            <figure key={image.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={image.imageUrl} alt={image.caption || ""} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                <span className="truncate">{image.caption || "—"}</span>
                <button
                  type="button"
                  className="font-semibold text-destructive"
                  onClick={() => void dispatch(deleteCourseGalleryImage({ courseId: Number(id), imageId: image.id }))}
                >
                  {t("admin.galleryRemove")}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">{t("admin.edition")}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {editions.map((edition) => (
            <button
              key={edition.id}
              type="button"
              onClick={() => void dispatch(fetchAdminCourse({ id: Number(id), editionId: edition.id }))}
              className={`max-w-full rounded-2xl px-3 py-2 text-left text-xs font-semibold sm:rounded-full sm:py-1 ${edition.id === editionId ? "bg-ink text-paper" : "bg-secondary"}`}
            >
              <span className="block whitespace-normal break-words sm:inline">
                {new Date(edition.startsAt).toLocaleDateString("es-MX")} · {edition.status} · {edition.paidCount}/{edition.capacity}
              </span>
            </button>
          ))}
        </div>
        {editionId ? (
          <Button
            className="mt-4"
            variant="outline"
            onClick={async () => {
              await dispatch(saveEdition({ id: editionId, body: { status: "confirmed" } }));
              void dispatch(fetchAdminCourse({ id: Number(id), editionId }));
            }}
          >
            {t("admin.confirm")}
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-paper p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">{t("admin.participants")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.participantsMoved")}</p>
          </div>
          <Link
            to={`/admin/participantes`}
            className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-paper"
          >
            {t("admin.openParticipants")}
          </Link>
        </div>
        {editionId ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("admin.editionRosterHint", { count: participants.length })}
          </p>
        ) : null}
      </div>

      <form className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2" onSubmit={editionForm.handleSubmit}>
        <h2 className="font-display text-2xl font-semibold md:col-span-2">{t("admin.schedule")}</h2>
        <div className="space-y-2">
          <Label htmlFor="startsAt">{t("admin.starts")}</Label>
          <Input id="startsAt" type="datetime-local" {...editionForm.getFieldProps("startsAt")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsAt">{t("admin.ends")}</Label>
          <Input id="endsAt" type="datetime-local" {...editionForm.getFieldProps("endsAt")} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="venueId">{t("admin.venue")}</Label>
          <select
            id="venueId"
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
            {...editionForm.getFieldProps("venueId")}
          >
            {catalog.venues
              .filter((venue) => venue.isActive)
              .map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.label}
                  {venue.cityLabel ? ` · ${venue.cityLabel}` : ""}
                  {venue.address ? ` — ${venue.address}` : ""}
                </option>
              ))}
          </select>
          <p className="text-[11px] text-muted-foreground">{t("admin.venueLegend")}</p>
        </div>
        <Button type="submit">{t("admin.schedule")}</Button>
      </form>
    </AdminSection>
  );
}

export function AdminPayments() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const payments = useAppSelector((state) => state.admin.payments);
  const pagination = useAppSelector((state) => state.admin.paymentsPagination);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    limit: 25,
    sortBy: "createdAt",
    sortDir: "DESC",
  });

  useEffect(() => {
    void dispatch(fetchPayments(query));
  }, [dispatch, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const columns = useMemo<DataGridColumn<PaymentRow>[]>(
    () => [
      {
        key: "courseTitle",
        label: t("admin.courses"),
        sortable: true,
        wrap: true,
        render: (payment) => (
          <div>
            <p className="font-semibold">{payment.courseTitle || payment.companyName || "—"}</p>
            <p className="text-sm text-muted-foreground">
              {payment.firstName} {payment.lastName} · {payment.email}
            </p>
          </div>
        ),
      },
      {
        key: "method",
        label: t("account.method"),
        sortable: true,
        shrink: true,
        render: (payment) => `${payment.method}${payment.cardLast4 ? ` ···· ${payment.cardLast4}` : ""}`,
      },
      { key: "status", label: t("admin.status"), sortable: true, shrink: true },
      {
        key: "amountCents",
        label: t("admin.price"),
        sortable: true,
        shrink: true,
        render: (payment) => formatMoney(payment.amountCents, payment.currency),
      },
    ],
    [t],
  );

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.payments")} description={t("admin.paymentsBody")} />
      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-paper px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.searchPayments")}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={payments}
          columns={columns}
          rowKey={(payment) => payment.id}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          onSort={(key) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              sortBy: key,
              sortDir: current.sortBy === key && current.sortDir === "ASC" ? "DESC" : "ASC",
            }))
          }
          pagination={pagination}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          isLoading={loading}
          emptyMessage={t("admin.emptyPayments")}
          noBleeding
          mobileCard={(payment) => (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold break-words">{payment.courseTitle || payment.companyName || "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words">
                {payment.firstName} {payment.lastName} · {payment.email}
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {payment.status} · {payment.method}
                {payment.cardLast4 ? ` ···· ${payment.cardLast4}` : ""}
              </p>
              <p className="mt-2 text-sm font-semibold">{formatMoney(payment.amountCents, payment.currency)}</p>
            </div>
          )}
        />
      </div>
    </AdminSection>
  );
}

export function AdminTeam() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const team = useAppSelector((state) => state.admin.team);
  const pagination = useAppSelector((state) => state.admin.teamPagination);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const error = useAppSelector((state) => state.admin.error);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<AdminListQuery>({ page: 1, limit: 25, sortBy: "role", sortDir: "ASC" });

  useEffect(() => {
    void dispatch(fetchTeam(query));
  }, [dispatch, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const form = useFormik({
    initialValues: { email: "", firstName: "", lastName: "", role: "coordinator", companyName: "" },
    validationSchema: Yup.object({
      email: Yup.string().email(t("common.invalidEmail")).required(t("common.required")),
      firstName: Yup.string().required(t("common.required")),
      lastName: Yup.string(),
      role: Yup.string().required(),
      companyName: Yup.string().when("role", {
        is: "company",
        then: (schema) => schema.trim().required(t("common.required")),
        otherwise: (schema) => schema,
      }),
    }),
    onSubmit: async (values, helpers) => {
      const invited = await dispatch(
        inviteStaff({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role,
          companyName: values.role === "company" ? values.companyName : undefined,
        }),
      );
      if (inviteStaff.fulfilled.match(invited)) {
        helpers.resetForm();
        void dispatch(fetchTeam(query));
      }
    },
  });

  const columns = useMemo<DataGridColumn<AdminProfile>[]>(
    () => [
      {
        key: "firstName",
        label: t("admin.team"),
        sortable: true,
        render: (member) => (
          <div>
            <p className="font-semibold">
              {member.firstName} {member.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
        ),
      },
      { key: "role", label: t("admin.role"), sortable: true, shrink: true },
      { key: "status", label: t("admin.status"), sortable: true, shrink: true },
      {
        key: "id",
        label: "",
        shrink: true,
        render: (member) =>
          role === "owner" && member.status !== "disabled" ? (
            <button
              type="button"
              className="text-xs font-semibold uppercase text-muted-foreground"
              onClick={async () => {
                await dispatch(updateStaff({ id: member.id, body: { status: "disabled" } }));
                void dispatch(fetchTeam(query));
              }}
            >
              {t("admin.disable")}
            </button>
          ) : (
            "—"
          ),
      },
    ],
    [dispatch, query, role, t],
  );

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.team")} description={t("admin.teamBody")} />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-paper px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.searchTeam")}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={team}
          columns={columns}
          rowKey={(member) => member.id}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          onSort={(key) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              sortBy: key,
              sortDir: current.sortBy === key && current.sortDir === "ASC" ? "DESC" : "ASC",
            }))
          }
          pagination={pagination}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          isLoading={loading}
          emptyMessage={t("admin.emptyTeam")}
          noBleeding
          mobileCard={(member) => (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold break-words">
                {member.firstName} {member.lastName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground break-all">{member.email}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {member.role} · {member.status}
              </p>
              {role === "owner" && member.status !== "disabled" ? (
                <button
                  type="button"
                  className="mt-3 text-xs font-semibold uppercase text-muted-foreground"
                  onClick={async () => {
                    await dispatch(updateStaff({ id: member.id, body: { status: "disabled" } }));
                    void dispatch(fetchTeam(query));
                  }}
                >
                  {t("admin.disable")}
                </button>
              ) : null}
            </div>
          )}
        />
      </div>
      {role === "owner" ? (
        <form className="mt-8 grid max-w-xl gap-3 rounded-2xl border border-border bg-paper p-5" onSubmit={form.handleSubmit}>
          <h2 className="font-display text-2xl font-semibold">{t("admin.invite")}</h2>
          <Input placeholder={t("common.email")} {...form.getFieldProps("email")} />
          <Input placeholder={t("common.firstName")} {...form.getFieldProps("firstName")} />
          <Input placeholder={t("common.lastName")} {...form.getFieldProps("lastName")} />
          <select className="h-11 rounded-md border border-input bg-card px-3" {...form.getFieldProps("role")}>
            <option value="coordinator">coordinator</option>
            <option value="instructor">instructor</option>
            <option value="finance">finance</option>
            <option value="owner">owner</option>
            <option value="company">company</option>
          </select>
          {form.values.role === "company" ? (
            <Input placeholder={t("auth.companyName")} {...form.getFieldProps("companyName")} />
          ) : null}
          <Button type="submit">{t("admin.invite")}</Button>
        </form>
      ) : null}
    </AdminSection>
  );
}

export function AdminCompanyRequests() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const { requests, error } = useAppSelector((state) => state.company);

  useEffect(() => {
    if (admin?.role === "company") void dispatch(fetchCompanyRequests());
  }, [admin?.role, dispatch]);

  const form = useFormik({
    initialValues: { title: "", headcount: 12, notes: "" },
    validationSchema: Yup.object({
      title: Yup.string().trim().min(3).required(t("common.required")),
      headcount: Yup.number().min(4).max(80).required(),
      notes: Yup.string(),
    }),
    onSubmit: async (values, helpers) => {
      const created = await dispatch(
        createCompanyRequest({
          title: values.title,
          headcount: Number(values.headcount),
          notes: values.notes,
        }),
      );
      if (createCompanyRequest.fulfilled.match(created)) {
        helpers.resetForm();
        void dispatch(fetchCompanyRequests());
      }
    },
  });

  if (admin && admin.role !== "company") return <Navigate to="/admin" replace />;

  return (
    <section className="mx-auto max-w-3xl">
      <PageMeta title={t("companyPortal.title")} description={t("companyPortal.body")} robots="noindex, nofollow" />
      <p className="text-xs uppercase tracking-[0.16em] text-primary">{admin?.companyName}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{t("companyPortal.title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("companyPortal.body")}</p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <form className="mt-8 space-y-4" onSubmit={form.handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="title">{t("admin.promise")}</Label>
          <Input id="title" {...form.getFieldProps("title")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="headcount">{t("companyPortal.headcount")}</Label>
          <Input id="headcount" type="number" {...form.getFieldProps("headcount")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">{t("companyPortal.notes")}</Label>
          <Textarea id="notes" {...form.getFieldProps("notes")} />
        </div>
        <Button type="submit">{t("companyPortal.ask")}</Button>
      </form>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {requests.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("companyPortal.empty")}</p> : null}
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold">{request.title}</p>
              <p className="text-sm text-muted-foreground">{request.headcount}</p>
            </div>
            <p className="text-xs uppercase tracking-[0.14em]">{request.status}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminLegalPages() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const { adminPages, error } = useAppSelector((state) => state.site);

  useEffect(() => {
    if (admin?.role === "owner" || admin?.role === "coordinator") {
      void dispatch(fetchAdminPages());
    }
  }, [admin?.role, dispatch]);

  if (admin && admin.role !== "owner" && admin.role !== "coordinator") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <section>
      <PageMeta title={t("admin.legal")} description={t("admin.legalBody")} robots="noindex, nofollow" />
      <h1 className="font-display text-4xl font-semibold">{t("admin.legal")}</h1>
      <p className="mt-2 text-muted-foreground">{t("admin.legalBody")}</p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      <div className="mt-8 divide-y divide-border border-y border-border">
        {adminPages.map((page) => (
          <Link
            key={page.slug}
            to={`/admin/legal/${page.slug}`}
            className="flex items-center justify-between gap-4 py-4 transition hover:text-primary"
          >
            <div>
              <p className="font-semibold">{page.titleEs}</p>
              <p className="text-sm text-muted-foreground">{page.titleEn}</p>
            </div>
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{page.slug}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AdminLegalPageEdit() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const admin = useAppSelector((state) => state.adminAuth.admin);
  const { adminPage, loading, saving, error } = useAppSelector((state) => state.site);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!slug) return;
    if (admin?.role === "owner" || admin?.role === "coordinator") {
      void dispatch(fetchAdminPage(slug));
    }
  }, [admin?.role, dispatch, slug]);

  const form = useFormik({
    enableReinitialize: true,
    initialValues: {
      titleEs: adminPage?.titleEs || "",
      titleEn: adminPage?.titleEn || "",
      bodyMdEs: adminPage?.bodyMdEs || "",
      bodyMdEn: adminPage?.bodyMdEn || "",
    },
    validationSchema: Yup.object({
      titleEs: Yup.string().min(3).max(200).required(),
      titleEn: Yup.string().min(3).max(200).required(),
      bodyMdEs: Yup.string().min(20).required(),
      bodyMdEn: Yup.string().min(20).required(),
    }),
    onSubmit: async (values) => {
      setSaved(false);
      const result = await dispatch(saveAdminPage({ slug, ...values }));
      if (saveAdminPage.fulfilled.match(result)) setSaved(true);
    },
  });

  if (admin && admin.role !== "owner" && admin.role !== "coordinator") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminSection>
      <AdminPageHeader
        title={slug}
        description={t("admin.legalBody")}
        backTo="/admin/legal"
        backLabel={t("admin.goBackLegal")}
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {loading ? <Skeleton className="h-64 w-full rounded-md" /> : null}
      {!loading && adminPage ? (
        <form className="mx-auto max-w-4xl space-y-5" onSubmit={form.handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="titleEs">{t("admin.legalTitleEs")}</Label>
              <Input id="titleEs" {...form.getFieldProps("titleEs")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="titleEn">{t("admin.legalTitleEn")}</Label>
              <Input id="titleEn" {...form.getFieldProps("titleEn")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bodyMdEs">{t("admin.legalMarkdownEs")}</Label>
            <Textarea id="bodyMdEs" className="min-h-[240px] font-mono text-sm" {...form.getFieldProps("bodyMdEs")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bodyMdEn">{t("admin.legalMarkdownEn")}</Label>
            <Textarea id="bodyMdEn" className="min-h-[240px] font-mono text-sm" {...form.getFieldProps("bodyMdEn")} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
            {saved ? <span className="text-sm text-primary">{t("admin.legalSaved")}</span> : null}
            <Link to={`/legal/${slug}`} className="text-sm font-medium text-muted-foreground hover:text-ink" target="_blank" rel="noreferrer">
              /legal/{slug} ↗
            </Link>
          </div>
        </form>
      ) : null}
    </AdminSection>
  );
}
