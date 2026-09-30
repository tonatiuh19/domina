import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import { AdminPageHeader, AdminPrimaryLink, AdminSecondaryLink } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchAdminCourses, type AdminListQuery } from "@/store/slices/adminSlice";
import type { Course } from "@shared/api";

export function AdminCoursesPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const courses = useAppSelector((state) => state.admin.courses);
  const pagination = useAppSelector((state) => state.admin.coursesPagination);
  const loading = useAppSelector((state) => state.admin.listLoading);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    limit: 20,
    sortBy: "updatedAt",
    sortDir: "DESC",
  });

  useEffect(() => {
    void dispatch(fetchAdminCourses(query));
  }, [dispatch, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const columns = useMemo<DataGridColumn<Course>[]>(
    () => [
      {
        key: "title",
        label: t("admin.courses"),
        sortable: true,
        wrap: true,
        render: (course) => (
          <div>
            <p className="font-semibold text-ink">{course.title}</p>
            <p className="text-sm text-muted-foreground">{course.promise}</p>
          </div>
        ),
      },
      {
        key: "category",
        label: t("admin.category"),
        sortable: true,
        shrink: true,
        render: (course) => <span className="uppercase tracking-[0.12em] text-xs">{course.categoryLabel || course.category}</span>,
      },
      {
        key: "status",
        label: t("admin.status"),
        sortable: true,
        shrink: true,
        render: (course) => (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {course.status}
          </span>
        ),
      },
      {
        key: "priceCents",
        label: t("admin.price"),
        sortable: true,
        shrink: true,
        render: (course) => formatMoney(course.priceCents, course.currency),
      },
    ],
    [t],
  );

  return (
    <AdminSection>
      <AdminPageHeader
        title={t("admin.courses")}
        description={t("admin.coursesBody")}
        actions={
          <>
            <AdminSecondaryLink to="/admin/cursos/catalogo">{t("admin.catalogTitle")}</AdminSecondaryLink>
            <AdminPrimaryLink to="/admin/cursos/nuevo">
              <Plus className="h-4 w-4" aria-hidden />
              {t("admin.createCourse")}
            </AdminPrimaryLink>
          </>
        }
      />

      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-paper px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.searchCourses")}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="rounded-2xl border border-border bg-paper p-2 sm:p-4">
        <DataGrid
          data={courses}
          columns={columns}
          rowKey={(course) => course.id}
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
          emptyMessage={t("admin.emptyCourses")}
          onRowClick={(course) => navigate(`/admin/cursos/${course.id}`)}
          noBleeding
          mobileCard={(course) => (
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-card p-4 text-left"
              onClick={() => navigate(`/admin/cursos/${course.id}`)}
            >
              <p className="font-semibold">{course.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{course.promise}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {course.status} · {formatMoney(course.priceCents, course.currency)}
              </p>
            </button>
          )}
        />
      </div>
    </AdminSection>
  );
}
