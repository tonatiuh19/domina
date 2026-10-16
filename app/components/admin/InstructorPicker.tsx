import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchInstructors, type InstructorRow } from "@/store/slices/adminSlice";

/** Search + dropdown picker for assigning an instructor to an edition (4A+B). */
export function InstructorPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (instructorAdminId: number | null) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const instructors = useAppSelector((state) => state.admin.instructors);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dispatch(fetchInstructors({ page: 1, limit: 100, activeOnly: true })).then(() => setLoaded(true));
  }, [dispatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void dispatch(
        fetchInstructors({
          page: 1,
          limit: 100,
          activeOnly: true,
          search: search.trim() || undefined,
        }),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dispatch, search]);

  const selected = useMemo(
    () => instructors.find((item) => item.id === value) || null,
    [instructors, value],
  );

  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor="instructorSearch">{t("admin.instructor")}</Label>
      <Input
        id="instructorSearch"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("admin.instructorSearch")}
      />
      <select
        className="h-11 w-full max-w-full rounded-md border border-input bg-card px-3 text-sm"
        value={value ?? ""}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) && next > 0 ? next : null);
        }}
      >
        <option value="">{t("admin.instructorUnassigned")}</option>
        {instructors.map((instructor: InstructorRow) => (
          <option key={instructor.id} value={instructor.id}>
            {instructor.firstName} {instructor.lastName} · {instructor.email}
          </option>
        ))}
        {selected && !instructors.some((item) => item.id === selected.id) ? (
          <option value={selected.id}>
            {selected.firstName} {selected.lastName} · {selected.email}
          </option>
        ) : null}
      </select>
      <p className="text-[11px] text-muted-foreground">
        {loaded ? t("admin.instructorPickerHint") : t("common.loading")}
      </p>
    </div>
  );
}
