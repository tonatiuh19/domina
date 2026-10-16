import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchInstructors,
  inviteInstructor,
  updateInstructor,
  type AdminListQuery,
  type InstructorRow,
} from "@/store/slices/adminSlice";

export function AdminInstructorsPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const instructors = useAppSelector((state) => state.admin.instructors);
  const pagination = useAppSelector((state) => state.admin.instructorsPagination);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const saving = useAppSelector((state) => state.admin.saving);
  const error = useAppSelector((state) => state.admin.error);
  const role = useAppSelector((state) => state.adminAuth.admin?.role);
  const canManage = role === "owner" || role === "coordinator";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<AdminListQuery>({ page: 1, limit: 25, sortBy: "firstName", sortDir: "ASC" });

  useEffect(() => {
    if (!canManage) return;
    void dispatch(fetchInstructors(query));
  }, [canManage, dispatch, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const form = useFormik({
    initialValues: { email: "", firstName: "", lastName: "" },
    validationSchema: Yup.object({
      email: Yup.string().email(t("common.invalidEmail")).required(t("common.required")),
      firstName: Yup.string().required(t("common.required")),
      lastName: Yup.string(),
    }),
    onSubmit: async (values, helpers) => {
      const invited = await dispatch(inviteInstructor(values));
      if (inviteInstructor.fulfilled.match(invited)) {
        helpers.resetForm();
        void dispatch(fetchInstructors(query));
      }
    },
  });

  const columns = useMemo<DataGridColumn<InstructorRow>[]>(
    () => [
      {
        key: "firstName",
        label: t("admin.instructors"),
        sortable: true,
        wrap: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-semibold break-words">
              {row.firstName} {row.lastName}
            </p>
            <p className="text-sm text-muted-foreground break-all">{row.email}</p>
          </div>
        ),
      },
      { key: "status", label: t("admin.status"), sortable: true, shrink: true },
      {
        key: "assignedEditions",
        label: t("admin.assignedEditions"),
        shrink: true,
        render: (row) => String(row.assignedEditions ?? 0),
      },
      {
        key: "actions",
        label: t("admin.actions"),
        shrink: true,
        render: (row) =>
          row.status !== "disabled" ? (
            <button
              type="button"
              className="text-xs font-semibold uppercase text-muted-foreground"
              onClick={async () => {
                await dispatch(updateInstructor({ id: row.id, body: { status: "disabled" } }));
                void dispatch(fetchInstructors(query));
              }}
            >
              {t("admin.disable")}
            </button>
          ) : (
            "—"
          ),
      },
    ],
    [dispatch, query, t],
  );

  if (!canManage) {
    return (
      <AdminSection>
        <AdminPageHeader title={t("admin.instructors")} description={t("admin.instructorsForbidden")} />
      </AdminSection>
    );
  }

  return (
    <AdminSection>
      <AdminPageHeader title={t("admin.instructors")} description={t("admin.instructorsBody")} />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-paper px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.searchInstructors")}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={instructors}
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
          emptyMessage={t("admin.emptyInstructors")}
          noBleeding
          mobileCard={(row) => (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold break-words">
                {row.firstName} {row.lastName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground break-all">{row.email}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {row.status} · {row.assignedEditions ?? 0} {t("admin.edition").toLowerCase()}
              </p>
            </div>
          )}
        />
      </div>

      <form className="mt-8 grid max-w-xl gap-3 rounded-2xl border border-border bg-paper p-5" onSubmit={form.handleSubmit}>
        <h2 className="font-display text-2xl font-semibold">{t("admin.inviteInstructor")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.inviteInstructorBody")}</p>
        <Input placeholder={t("common.email")} {...form.getFieldProps("email")} />
        <Input placeholder={t("common.firstName")} {...form.getFieldProps("firstName")} />
        <Input placeholder={t("common.lastName")} {...form.getFieldProps("lastName")} />
        <Button type="submit" disabled={saving}>
          {saving ? t("common.loading") : t("admin.inviteInstructor")}
        </Button>
      </form>
    </AdminSection>
  );
}
