import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReserveAuthModal } from "@/components/auth/ReserveAuthModal";
import { CourseDescriptionHtml } from "@/components/course/CourseDescriptionHtml";
import { CourseGallery } from "@/components/course/CourseGallery";
import { PageMeta, coursePageMeta } from "@/components/site/PageMeta";
import { CatalogListSkeleton, CourseDetailSkeleton } from "@/components/ui/skeleton";
import { MarketingFrame } from "@/pages/public/MarketingChrome";
import { courseCoverUrl } from "@/lib/cdn";
import { formatMoney } from "@/lib/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCatalog, fetchCourse } from "@/store/slices/catalogSlice";
import { reserveSeat } from "@/store/slices/portalSlice";

export function Catalog() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const category = params.get("categoria") || "all";
  const { courses, loading, error } = useAppSelector((state) => state.catalog);
  const visible = courses.filter((course) => category === "all" || course.category === category);

  useEffect(() => {
    void dispatch(fetchCatalog());
  }, [dispatch]);

  return (
    <MarketingFrame>
      <PageMeta
        title={t("catalog.title")}
        description={t("seo.catalogDescription")}
        path="/cursos"
        keywords={t("seo.keywords")}
      />
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight break-words sm:text-5xl">{t("catalog.title")}</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">{t("catalog.body")}</p>
        <div className="mt-8 flex flex-wrap gap-2">
          {["all", "tech", "maker", "skills"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setParams(key === "all" ? {} : { categoria: key })}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                category === key ? "bg-ink text-paper" : "bg-secondary text-foreground"
              }`}
            >
              {key === "all" ? t("catalog.all") : key}
            </button>
          ))}
        </div>
        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}
        {loading ? <CatalogListSkeleton /> : null}
        {!loading && visible.length === 0 ? <p className="mt-8 text-muted-foreground">{t("catalog.empty")}</p> : null}
        {!loading ? (
          <div className="mt-8 divide-y divide-border border-y border-border">
            {visible.map((course) => (
              <Link
                key={course.id}
                to={`/cursos/${course.slug}`}
                className="grid gap-4 py-6 md:grid-cols-[120px_140px_1fr_140px] md:items-center"
              >
                <img
                  src={courseCoverUrl(course.slug, course.coverImageUrl)}
                  alt=""
                  className="h-20 w-full rounded-md object-cover md:h-24"
                  loading="lazy"
                />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {course.category}
                </span>
                <span>
                  <span className="block font-display text-2xl font-semibold tracking-tight">{course.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{course.promise}</span>
                </span>
                <span className="text-sm font-semibold md:text-right">
                  {t("catalog.from")} {formatMoney(course.priceCents, course.currency)}
                  <span className="mt-1 block font-normal text-muted-foreground">
                    {course.capacity} {t("catalog.seats")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </MarketingFrame>
  );
}

export function CourseDetail() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { course, loading, error } = useAppSelector((state) => state.catalog);
  const token = useAppSelector((state) => state.userAuth.token);
  const saving = useAppSelector((state) => state.portal.saving);
  const portalError = useAppSelector((state) => state.portal.error);
  const showSkeleton = loading || (!course && !error);
  const [pendingEditionId, setPendingEditionId] = useState<number | null>(null);

  useEffect(() => {
    if (slug) void dispatch(fetchCourse(slug));
  }, [dispatch, slug]);

  const reserveEdition = async (editionId: number) => {
    const result = await dispatch(reserveSeat(editionId));
    if (!reserveSeat.fulfilled.match(result)) return;
    if (result.payload.alreadyPaid) {
      navigate("/cuenta");
      return;
    }
    navigate(`/cuenta/pagar/${result.payload.enrollmentId}`);
  };

  const pendingEdition = (course?.editions || []).find((edition) => edition.id === pendingEditionId);
  const editionLabel = pendingEdition
    ? `${new Date(pendingEdition.startsAt).toLocaleString("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      })} · ${pendingEdition.venueName}`
    : undefined;

  return (
    <MarketingFrame>
      {course ? <PageMeta {...coursePageMeta(course)} /> : (
        <PageMeta
          title={t("catalog.title")}
          description={t("seo.courseFallbackDescription")}
          path={slug ? `/cursos/${slug}` : "/cursos"}
        />
      )}
      {showSkeleton ? <CourseDetailSkeleton /> : null}
      {error && !course ? (
        <p className="mx-auto max-w-6xl px-5 py-12 text-destructive">{error}</p>
      ) : null}
      {course && !loading ? (
        <article className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <img
              src={courseCoverUrl(course.slug, course.coverImageUrl)}
              alt=""
              className="mb-6 aspect-[16/9] w-full rounded-lg object-cover"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {course.category} · {course.city}
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight break-words sm:text-5xl">{course.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 sm:text-xl">{course.promise}</p>
            <p className="mt-4 max-w-xl text-muted-foreground">{course.summary}</p>
            <dl className="mt-8 grid grid-cols-1 gap-4 border-y border-border py-5 text-sm min-[380px]:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("home.practice")}</dt>
                <dd className="font-semibold">{course.practiceRatio}%</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("admin.capacity")}</dt>
                <dd className="font-semibold">{course.capacity}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("admin.price")}</dt>
                <dd className="font-semibold break-words">{formatMoney(course.priceCents, course.currency)}</dd>
              </div>
            </dl>
            {course.descriptionHtml ? (
              <div className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("course.about")}</p>
                <CourseDescriptionHtml html={course.descriptionHtml} className="mt-3 max-w-2xl" />
              </div>
            ) : null}
            <CourseGallery images={course.gallery || []} />
          </div>
          <aside className="space-y-4">
            <h2 className="font-display text-2xl font-semibold">{t("course.when")}</h2>
            <p className="text-sm text-muted-foreground">{t("course.min")}</p>
            {portalError ? <p className="text-sm text-destructive">{portalError}</p> : null}
            {(course.editions || []).map((edition) => {
              const full = edition.heldCount >= edition.capacity;
              const dateLabel = new Date(edition.startsAt).toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              });
              return (
                <button
                  key={edition.id}
                  type="button"
                  disabled={full || saving}
                  onClick={async () => {
                    if (full) return;
                    if (token) {
                      await reserveEdition(edition.id);
                      return;
                    }
                    setPendingEditionId(edition.id);
                  }}
                  className="w-full rounded-lg border border-border bg-card p-4 text-left transition hover:border-ink/30 hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <p className="font-semibold">{dateLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {edition.venueName} · {edition.city}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("home.withInstructor", {
                      name: edition.instructorName?.trim() || t("course.instructorTbd"),
                    })}
                  </p>
                  <p className="mt-2 text-sm">
                    {edition.paidCount}/{edition.minEnrollment} · {formatMoney(edition.priceCents, edition.currency)}
                  </p>
                  {token ? (
                    <span className="mt-4 inline-flex text-sm font-semibold text-primary">
                      {full ? t("course.full") : t("course.reserve")}
                    </span>
                  ) : (
                    <span className="mt-4 inline-flex text-sm font-semibold text-primary">
                      {full ? t("course.full") : t("course.signIn")}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>
        </article>
      ) : null}

      <ReserveAuthModal
        open={Boolean(pendingEditionId)}
        onClose={() => setPendingEditionId(null)}
        editionLabel={editionLabel}
        onAuthenticated={async () => {
          const editionId = pendingEditionId;
          setPendingEditionId(null);
          if (editionId) await reserveEdition(editionId);
        }}
      />
    </MarketingFrame>
  );
}
