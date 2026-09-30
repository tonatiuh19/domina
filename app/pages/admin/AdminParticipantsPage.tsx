import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  addParticipant,
  fetchOpenEditions,
  fetchParticipants,
  type AdminListQuery,
} from "@/store/slices/adminSlice";
import type { AdminParticipantRow } from "@shared/api";

export function AdminParticipantsPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const rows = useAppSelector((state) => state.admin.participantRows);
  const pagination = useAppSelector((state) => state.admin.participantsPagination);
  const editions = useAppSelector((state) => state.admin.openEditions);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const saving = useAppSelector((state) => state.admin.saving);
  const error = useAppSelector((state) => state.admin.error);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saved, setSaved] = useState(false);
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-MX";
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    limit: 25,
    sortBy: "createdAt",
    sortDir: "DESC",
  });

  useEffect(() => {
    void dispatch(fetchParticipants(query));
  }, [dispatch, query]);

  useEffect(() => {
    void dispatch(fetchOpenEditions());
  }, [dispatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const form = useFormik({
    initialValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      editionId: 0,
      paymentMethod: "complimentary",
      sendConfirmationEmail: true,
    },
    validationSchema: Yup.object({
      email: Yup.string().email(t("common.invalidEmail")).required(t("common.required")),
      firstName: Yup.string().required(t("common.required")),
      editionId: Yup.number().integer().positive().required(),
      paymentMethod: Yup.string().required(),
    }),
    onSubmit: async (values, helpers) => {
      setSaved(false);
      const result = await dispatch(
        addParticipant({
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          editionId: Number(values.editionId),
          paymentMethod: values.paymentMethod as "complimentary" | "transfer" | "company_invoice" | "card",
          sendConfirmationEmail: values.sendConfirmationEmail,
        }),
      );
      if (addParticipant.fulfilled.match(result)) {
        setSaved(true);
        helpers.resetForm();
        void dispatch(fetchParticipants(query));
      }
    },
  });

  const columns = useMemo<DataGridColumn<AdminParticipantRow>[]>(
    () => [
      {
        key: "firstName",
        label: t("common.firstName"),
        sortable: true,
        render: (row) => (
          <div>
            <p className="font-semibold">
              {row.firstName} {row.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{row.email}</p>
          </div>
        ),
      },
      {
        key: "courseTitle",
        label: t("admin.courses"),
        sortable: true,
        wrap: true,
        render: (row) => (
          <div>
            <p className="font-medium">{row.courseTitle}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(row.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · {row.city}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        label: t("admin.status"),
        sortable: true,
        shrink: true,
      },
      {
        key: "paymentMethod",
        label: t("account.method"),
        shrink: true,
        render: (row) => row.paymentMethod || "—",
      },
      {
        key: "amountCents",
        label: t("admin.price"),
        sortable: true,
        shrink: true,
        render: (row) => formatMoney(row.amountCents, row.currency),
      },
    ],
    [locale, t],
  );

  return (
    <AdminSection>
      <AdminPageHeader
        title={t("admin.participants")}
        description={t("admin.participantsBody")}
        actions={
          <Button type="button" onClick={() => setShowAdd((value) => !value)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("admin.addParticipant")}
          </Button>
        }
      />

      {showAdd ? (
        <form
          className="mb-8 grid gap-4 rounded-2xl border border-border bg-paper p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={form.handleSubmit}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="editionId">{t("admin.edition")}</Label>
            <select
              id="editionId"
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
              {...form.getFieldProps("editionId")}
            >
              <option value={0}>{t("admin.chooseEdition")}</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.courseTitle} · {new Date(edition.startsAt).toLocaleDateString(locale)} ·{" "}
                  {edition.paidCount}/{edition.capacity}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input id="email" type="email" {...form.getFieldProps("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t("account.phone")}</Label>
            <Input id="phone" {...form.getFieldProps("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("common.firstName")}</Label>
            <Input id="firstName" {...form.getFieldProps("firstName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t("common.lastName")}</Label>
            <Input id="lastName" {...form.getFieldProps("lastName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">{t("account.method")}</Label>
            <select
              id="paymentMethod"
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
              {...form.getFieldProps("paymentMethod")}
            >
              <option value="complimentary">{t("admin.complimentary")}</option>
              <option value="transfer">{t("admin.transfer")}</option>
              <option value="company_invoice">{t("admin.invoice")}</option>
              <option value="card">{t("account.card")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.values.sendConfirmationEmail}
              onChange={(event) => void form.setFieldValue("sendConfirmationEmail", event.target.checked)}
            />
            {t("admin.sendSeatEmail")}
          </label>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          {saved ? <p className="text-sm font-medium text-primary sm:col-span-2">{t("admin.participantAdded")}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.loading") : t("admin.addParticipant")}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-paper px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.searchParticipants")}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={rows}
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
          emptyMessage={t("admin.noParticipants")}
          noBleeding
          mobileCard={(row) => (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">
                {row.firstName} {row.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{row.email}</p>
              <p className="mt-2 text-sm">{row.courseTitle}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {row.status} · {formatMoney(row.amountCents, row.currency)}
              </p>
              <Link to={`/admin/cursos/${row.courseId}`} className="mt-3 inline-flex text-sm font-semibold text-primary">
                {t("admin.openCourse")}
              </Link>
            </div>
          )}
        />
      </div>
    </AdminSection>
  );
}
