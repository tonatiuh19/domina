import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Plus, Search, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createCoupon,
  fetchAdminCourses,
  fetchCoupons,
  fetchOpenEditions,
  updateCoupon,
  type AdminListQuery,
  type CouponRow,
} from "@/store/slices/adminSlice";

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function AdminCouponsPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const coupons = useAppSelector((state) => state.admin.coupons);
  const pagination = useAppSelector((state) => state.admin.couponsPagination);
  const courses = useAppSelector((state) => state.admin.courses);
  const openEditions = useAppSelector((state) => state.admin.openEditions);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const saving = useAppSelector((state) => state.admin.saving);
  const error = useAppSelector((state) => state.admin.error);
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const canManage = role === "owner" || role === "finance";
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    limit: 25,
    sortBy: "createdAt",
    sortDir: "DESC",
  });

  useEffect(() => {
    if (!canManage) return;
    void dispatch(fetchCoupons(query));
  }, [canManage, dispatch, query]);

  useEffect(() => {
    if (!canManage || !showForm) return;
    void dispatch(fetchAdminCourses({ page: 1, limit: 100, sortBy: "title", sortDir: "ASC" }));
    void dispatch(fetchOpenEditions());
  }, [canManage, dispatch, showForm]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const form = useFormik({
    initialValues: {
      code: "",
      name: "",
      discountType: "percent" as "percent" | "fixed",
      percentOff: 10,
      amountOffCents: 20000,
      scope: "all" as "all" | "course" | "edition",
      courseIds: [] as number[],
      editionIds: [] as number[],
      maxRedemptions: "",
      startsAt: "",
      endsAt: "",
      active: true,
    },
    validationSchema: Yup.object({
      code: Yup.string().required(t("common.required")).min(2).max(40),
      name: Yup.string().required(t("common.required")),
      discountType: Yup.string().oneOf(["percent", "fixed"]).required(),
      scope: Yup.string().oneOf(["all", "course", "edition"]).required(),
      percentOff: Yup.number().when("discountType", {
        is: "percent",
        then: (schema) => schema.min(0.01).max(100).required(),
        otherwise: (schema) => schema.optional(),
      }),
      amountOffCents: Yup.number().when("discountType", {
        is: "fixed",
        then: (schema) => schema.min(1).required(),
        otherwise: (schema) => schema.optional(),
      }),
      courseIds: Yup.array().when("scope", {
        is: "course",
        then: (schema) => schema.min(1, t("common.required")),
        otherwise: (schema) => schema.optional(),
      }),
      editionIds: Yup.array().when("scope", {
        is: "edition",
        then: (schema) => schema.min(1, t("common.required")),
        otherwise: (schema) => schema.optional(),
      }),
    }),
    onSubmit: async (values, helpers) => {
      const result = await dispatch(
        createCoupon({
          code: values.code.trim().toUpperCase(),
          name: values.name.trim(),
          discountType: values.discountType,
          percentOff: values.discountType === "percent" ? Number(values.percentOff) : null,
          amountOffCents: values.discountType === "fixed" ? Number(values.amountOffCents) : null,
          scope: values.scope,
          courseIds: values.scope === "course" ? values.courseIds : [],
          editionIds: values.scope === "edition" ? values.editionIds : [],
          maxRedemptions: values.maxRedemptions ? Number(values.maxRedemptions) : null,
          startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
          endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
          active: values.active,
        }),
      );
      if (createCoupon.fulfilled.match(result)) {
        helpers.resetForm();
        setShowForm(false);
        void dispatch(fetchCoupons(query));
      }
    },
  });

  const columns = useMemo<DataGridColumn<CouponRow>[]>(
    () => [
      {
        key: "code",
        label: t("admin.couponCode"),
        sortable: true,
        wrap: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-mono font-semibold break-all">{row.code}</p>
            <p className="text-sm text-muted-foreground break-words">{row.name}</p>
          </div>
        ),
      },
      {
        key: "discountType",
        label: t("admin.couponDiscount"),
        shrink: true,
        render: (row) =>
          row.discountType === "percent"
            ? `${row.percentOff}%`
            : formatMoney(row.amountOffCents || 0, row.currency),
      },
      {
        key: "scope",
        label: t("admin.couponScope"),
        shrink: true,
        render: (row) => t(`admin.couponScope_${row.scope}`),
      },
      {
        key: "redemptionCount",
        label: t("admin.couponRedemptions"),
        shrink: true,
        render: (row) =>
          row.maxRedemptions != null
            ? `${row.redemptionCount} / ${row.maxRedemptions}`
            : String(row.redemptionCount),
      },
      {
        key: "endsAt",
        label: t("admin.couponEnds"),
        sortable: true,
        shrink: true,
        render: (row) =>
          row.endsAt ? new Date(row.endsAt).toLocaleDateString() : t("admin.couponNoEnd"),
      },
      {
        key: "active",
        label: t("admin.status"),
        sortable: true,
        shrink: true,
        render: (row) => (row.active ? t("admin.couponActive") : t("admin.couponInactive")),
      },
      {
        key: "actions",
        label: t("admin.actions"),
        shrink: true,
        render: (row) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || !canManage}
            onClick={() => {
              void dispatch(updateCoupon({ id: row.id, body: { active: !row.active } })).then(
                (result) => {
                  if (updateCoupon.fulfilled.match(result)) void dispatch(fetchCoupons(query));
                },
              );
            }}
          >
            {row.active ? t("admin.couponDeactivate") : t("admin.couponActivate")}
          </Button>
        ),
      },
    ],
    [canManage, dispatch, query, saving, t],
  );

  if (!canManage) {
    return (
      <AdminSection>
        <AdminPageHeader title={t("admin.coupons")} description={t("admin.couponsDenied")} />
      </AdminSection>
    );
  }

  return (
    <AdminSection>
      <AdminPageHeader
        title={t("admin.coupons")}
        description={t("admin.couponsBody")}
        actions={
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("admin.couponCreate")}
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {showForm ? (
        <form
          onSubmit={form.handleSubmit}
          className="mb-6 grid max-w-full gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="coupon-code">{t("admin.couponCode")}</Label>
            <Input
              id="coupon-code"
              name="code"
              value={form.values.code}
              onChange={(event) => form.setFieldValue("code", event.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-name">{t("admin.couponName")}</Label>
            <Input
              id="coupon-name"
              name="name"
              value={form.values.name}
              onChange={form.handleChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-type">{t("admin.couponDiscountType")}</Label>
            <select
              id="coupon-type"
              className="flex h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.values.discountType}
              onChange={(event) =>
                form.setFieldValue("discountType", event.target.value as "percent" | "fixed")
              }
            >
              <option value="percent">{t("admin.couponPercent")}</option>
              <option value="fixed">{t("admin.couponFixed")}</option>
            </select>
          </div>
          {form.values.discountType === "percent" ? (
            <div className="space-y-2">
              <Label htmlFor="coupon-percent">{t("admin.couponPercentOff")}</Label>
              <Input
                id="coupon-percent"
                type="number"
                min={1}
                max={100}
                value={form.values.percentOff}
                onChange={(event) => form.setFieldValue("percentOff", Number(event.target.value))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="coupon-fixed">{t("admin.couponAmountOff")}</Label>
              <Input
                id="coupon-fixed"
                type="number"
                min={1}
                value={form.values.amountOffCents}
                onChange={(event) =>
                  form.setFieldValue("amountOffCents", Number(event.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">{t("admin.couponAmountOffHint")}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="coupon-scope">{t("admin.couponScope")}</Label>
            <select
              id="coupon-scope"
              className="flex h-10 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.values.scope}
              onChange={(event) =>
                form.setFieldValue("scope", event.target.value as "all" | "course" | "edition")
              }
            >
              <option value="all">{t("admin.couponScope_all")}</option>
              <option value="course">{t("admin.couponScope_course")}</option>
              <option value="edition">{t("admin.couponScope_edition")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-max">{t("admin.couponMaxRedemptions")}</Label>
            <Input
              id="coupon-max"
              type="number"
              min={1}
              placeholder={t("admin.couponUnlimited")}
              value={form.values.maxRedemptions}
              onChange={form.handleChange}
              name="maxRedemptions"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-starts">{t("admin.couponStarts")}</Label>
            <Input
              id="coupon-starts"
              type="datetime-local"
              value={form.values.startsAt}
              onChange={(event) => form.setFieldValue("startsAt", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coupon-ends">{t("admin.couponEnds")}</Label>
            <Input
              id="coupon-ends"
              type="datetime-local"
              value={form.values.endsAt}
              onChange={(event) => form.setFieldValue("endsAt", event.target.value)}
            />
          </div>

          {form.values.scope === "course" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("admin.couponPickCourses")}</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {courses.map((course) => (
                  <label key={course.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.values.courseIds.includes(course.id)}
                      onChange={() =>
                        form.setFieldValue("courseIds", toggleId(form.values.courseIds, course.id))
                      }
                    />
                    <span className="min-w-0 break-words">{course.title}</span>
                  </label>
                ))}
                {!courses.length ? (
                  <p className="text-xs text-muted-foreground">{t("admin.couponNoCourses")}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {form.values.scope === "edition" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("admin.couponPickEditions")}</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {openEditions.map((edition) => (
                  <label key={edition.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.values.editionIds.includes(edition.id)}
                      onChange={() =>
                        form.setFieldValue("editionIds", toggleId(form.values.editionIds, edition.id))
                      }
                    />
                    <span className="min-w-0 break-words">
                      {edition.courseTitle || t("admin.courses")} ·{" "}
                      {new Date(edition.startsAt).toLocaleString(
                        i18n.language?.startsWith("en") ? "en-US" : "es-MX",
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                    </span>
                  </label>
                ))}
                {!openEditions.length ? (
                  <p className="text-xs text-muted-foreground">{t("admin.couponNoEditions")}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              <TicketPercent className="h-4 w-4" aria-hidden />
              {t("admin.couponCreate")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t("common.back")}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex max-w-full flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.searchCoupons")}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={coupons}
          columns={columns}
          rowKey={(row) => row.id}
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
          emptyMessage={t("admin.emptyCoupons")}
          noBleeding
          mobileCard={(row) => (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="font-mono font-semibold break-all">{row.code}</p>
              <p className="text-sm text-muted-foreground break-words">{row.name}</p>
              <p className="text-sm">
                {row.discountType === "percent"
                  ? `${row.percentOff}%`
                  : formatMoney(row.amountOffCents || 0, row.currency)}{" "}
                · {t(`admin.couponScope_${row.scope}`)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  void dispatch(updateCoupon({ id: row.id, body: { active: !row.active } })).then(
                    (result) => {
                      if (updateCoupon.fulfilled.match(result)) void dispatch(fetchCoupons(query));
                    },
                  );
                }}
              >
                {row.active ? t("admin.couponDeactivate") : t("admin.couponActivate")}
              </Button>
            </div>
          )}
        />
      </div>
    </AdminSection>
  );
}
