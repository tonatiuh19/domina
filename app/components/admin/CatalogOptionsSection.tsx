import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createCatalogOption,
  fetchCatalogOptions,
  updateCatalogOption,
} from "@/store/slices/adminSlice";
import type { CatalogKind, CatalogOption } from "@shared/api";
import { cn } from "@/lib/utils";

const KINDS: CatalogKind[] = ["categories", "levels", "audiences", "cities", "venues"];

function KindManager({ kind }: { kind: CatalogKind }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const options = useAppSelector((state) => state.admin.catalog[kind]);
  const cities = useAppSelector((state) => state.admin.catalog.cities);
  const saving = useAppSelector((state) => state.admin.saving);
  const [editingId, setEditingId] = useState<number | null>(null);
  const isVenue = kind === "venues";

  const form = useFormik({
    initialValues: { label: "", slug: "", address: "", cityId: 0 },
    enableReinitialize: true,
    validationSchema: Yup.object({
      label: Yup.string().trim().min(2).max(160).required(t("common.required")),
      slug: Yup.string()
        .trim()
        .matches(/^[a-z0-9-]*$/, t("admin.catalogSlugLegend"))
        .max(80),
      address: isVenue ? Yup.string().trim().max(255) : Yup.string(),
      cityId: isVenue ? Yup.number().integer().min(1).required(t("common.required")) : Yup.number(),
    }),
    onSubmit: async (values, helpers) => {
      const created = await dispatch(
        createCatalogOption({
          kind,
          label: values.label.trim(),
          slug: values.slug.trim() || undefined,
          address: isVenue ? values.address.trim() : undefined,
          cityId: isVenue ? Number(values.cityId) : undefined,
        }),
      );
      if (createCatalogOption.fulfilled.match(created)) {
        helpers.resetForm({
          values: {
            label: "",
            slug: "",
            address: "",
            cityId: cities.find((c) => c.isActive)?.id || 0,
          },
        });
      }
    },
  });

  useEffect(() => {
    if (!isVenue || Number(form.values.cityId) > 0) return;
    const first = cities.find((city) => city.isActive);
    if (first) void form.setFieldValue("cityId", first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, isVenue]);

  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-card/50 p-4", isVenue && "lg:col-span-2")}>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t(`admin.catalogKind.${kind}`)}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {isVenue ? t("admin.catalogVenueHint") : t("admin.catalogKindHint")}
        </p>
      </div>

      <ul className="space-y-2">
        {options.map((option) => (
          <CatalogRow
            key={option.id}
            option={option}
            editing={editingId === option.id}
            onEdit={() => setEditingId(option.id)}
            onCancel={() => setEditingId(null)}
            onSaved={() => setEditingId(null)}
          />
        ))}
        {!options.length ? <li className="text-xs text-muted-foreground">{t("admin.catalogEmpty")}</li> : null}
      </ul>

      <form
        className={cn(
          "grid gap-2",
          isVenue ? "sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
        )}
        onSubmit={form.handleSubmit}
      >
        <Input
          className="min-w-0"
          placeholder={isVenue ? t("admin.catalogVenueName") : t("admin.catalogLabel")}
          value={form.values.label}
          onChange={(event) => void form.setFieldValue("label", event.target.value)}
        />
        {isVenue ? (
          <Input
            placeholder={t("admin.catalogVenueAddress")}
            value={form.values.address}
            onChange={(event) => void form.setFieldValue("address", event.target.value)}
          />
        ) : (
          <Input
            placeholder={t("admin.catalogSlugOptional")}
            value={form.values.slug}
            onChange={(event) => void form.setFieldValue("slug", event.target.value.toLowerCase())}
          />
        )}
        {isVenue ? (
          <select
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={form.values.cityId}
            onChange={(event) => void form.setFieldValue("cityId", Number(event.target.value))}
          >
            {cities
              .filter((city) => city.isActive)
              .map((city) => (
                <option key={city.id} value={city.id}>
                  {city.label}
                </option>
              ))}
          </select>
        ) : null}
        <Button type="submit" size="sm" disabled={saving}>
          {t("admin.catalogAdd")}
        </Button>
      </form>
    </div>
  );
}

function CatalogRow({
  option,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  option: CatalogOption;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const cities = useAppSelector((state) => state.admin.catalog.cities);
  const [label, setLabel] = useState(option.label);
  const [slug, setSlug] = useState(option.slug);
  const [address, setAddress] = useState(option.address || "");
  const [cityId, setCityId] = useState(option.cityId || 0);
  const isVenue = option.kind === "venues";

  useEffect(() => {
    setLabel(option.label);
    setSlug(option.slug);
    setAddress(option.address || "");
    setCityId(option.cityId || 0);
  }, [option.label, option.slug, option.address, option.cityId]);

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-border bg-paper p-2">
        <div className={cn("grid gap-2", isVenue ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          {isVenue ? (
            <>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} />
              <select
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={cityId}
                onChange={(event) => setCityId(Number(event.target.value))}
              >
                {cities
                  .filter((city) => city.isActive || city.id === option.cityId)
                  .map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.label}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <Input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const saved = await dispatch(
                updateCatalogOption({
                  kind: option.kind,
                  id: option.id,
                  body: isVenue
                    ? { label: label.trim(), address: address.trim(), cityId }
                    : { label: label.trim(), slug: slug.trim() },
                }),
              );
              if (updateCatalogOption.fulfilled.match(saved)) onSaved();
            }}
          >
            {t("common.save")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            {t("common.close")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-paper px-3 py-2",
        !option.isActive && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{option.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {isVenue
            ? [option.address, option.cityLabel].filter(Boolean).join(" · ")
            : option.slug}
          {!option.isActive ? ` · ${t("admin.catalogInactive")}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            void dispatch(
              updateCatalogOption({
                kind: option.kind,
                id: option.id,
                body: { isActive: !option.isActive },
              }),
            )
          }
        >
          {option.isActive ? t("admin.catalogDeactivate") : t("admin.catalogActivate")}
        </Button>
      </div>
    </li>
  );
}

export function CatalogOptionsSection({
  embedded = false,
  skipFetch = false,
}: {
  embedded?: boolean;
  skipFetch?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (skipFetch) return;
    for (const kind of KINDS) {
      void dispatch(fetchCatalogOptions({ kind, includeInactive: true }));
    }
  }, [dispatch, skipFetch]);

  return (
    <section className={embedded ? "space-y-4" : "mt-10 space-y-4"}>
      {embedded ? null : (
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{t("admin.catalogTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.catalogBody")}</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {KINDS.map((kind) => (
          <KindManager key={kind} kind={kind} />
        ))}
      </div>
    </section>
  );
}
