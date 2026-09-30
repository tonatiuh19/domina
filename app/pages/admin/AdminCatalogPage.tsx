import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSection } from "@/components/admin/AdminShell";
import { CatalogOptionsSection } from "@/components/admin/CatalogOptionsSection";
import { CatalogOptionsSkeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchAllCatalogOptions } from "@/store/slices/adminSlice";

export function AdminCatalogPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const catalogLoading = useAppSelector((state) => state.admin.catalogLoading);
  const error = useAppSelector((state) => state.admin.error);
  const hasOptions = useAppSelector((state) =>
    Object.values(state.admin.catalog).some((options) => options.length > 0),
  );

  useEffect(() => {
    void dispatch(fetchAllCatalogOptions({ includeInactive: true }));
  }, [dispatch]);

  const showSkeleton = catalogLoading && !hasOptions;

  return (
    <AdminSection>
      <AdminPageHeader
        title={t("admin.catalogTitle")}
        description={t("admin.catalogBody")}
        backTo="/admin/cursos"
        backLabel={t("admin.goBackCourses")}
        loading={showSkeleton}
      />
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="rounded-2xl border border-border bg-paper p-4 sm:p-6">
        {showSkeleton ? <CatalogOptionsSkeleton /> : <CatalogOptionsSection embedded skipFetch />}
      </div>
    </AdminSection>
  );
}
