import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MarketingFrame } from "./MarketingChrome";
import { PageMeta, homeJsonLd } from "@/components/site/PageMeta";

import { courseCoverUrl, DOMINA_CDN_IMAGES } from "@/lib/cdn";

const CATEGORY_ALL = "all" as const;
const CATEGORY_OPTIONS = ["DOMINA TECH", "DOMINA MAKER", "DOMINA SKILLS"] as const;
type CategoryOption = (typeof CATEGORY_OPTIONS)[number];
type CategoryFilter = typeof CATEGORY_ALL | CategoryOption;

type Course = {
  slug: string;
  category: CategoryOption;
  title: string;
  outcome: string;
  instructor: string;
  location: string;
  date: string;
  duration: string;
  price: string | null;
  image: string;
  alt: string;
  accent: string;
};

const courses: Course[] = [
  {
    slug: "mecanica-basica-para-mujeres",
    category: "DOMINA MAKER",
    title: "Mecánica básica para mujeres",
    outcome: "Diagnostica problemas comunes y entiende qué pasa bajo el cofre.",
    instructor: "Instructor por confirmar",
    location: "Zapopan, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "4 horas",
    price: "$1,200",
    image: courseCoverUrl("mecanica-basica-para-mujeres"),
    alt: "Manos trabajando en el motor de un automóvil en un taller.",
    accent: "maker",
  },
  {
    slug: "power-bi-practico",
    category: "DOMINA TECH",
    title: "Power BI práctico",
    outcome: "Construye tu primer dashboard funcional, de los datos a la decisión.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "6 horas",
    price: "$1,800",
    image: courseCoverUrl("power-bi-practico"),
    alt: "Gráficos en pantalla durante una sesión de análisis de datos.",
    accent: "tech",
  },
  {
    slug: "testing-de-software",
    category: "DOMINA TECH",
    title: "Testing de software",
    outcome: "Encuentra errores antes que tus usuarios y prueba con método.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "5 horas",
    price: "$1,500",
    image: courseCoverUrl("testing-de-software"),
    alt: "Especialista trabajando frente a herramientas digitales en su computadora.",
    accent: "tech",
  },
  {
    slug: "ia-para-el-trabajo",
    category: "DOMINA TECH",
    title: "IA para el trabajo",
    outcome: "Diseña un flujo de IA que te devuelva tiempo en tu día a día.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "4 horas",
    price: "$1,500",
    image: courseCoverUrl("ia-para-el-trabajo"),
    alt: "Equipo colaborando alrededor de una mesa en un taller práctico.",
    accent: "tech",
  },
  {
    slug: "soldadura-mig",
    category: "DOMINA MAKER",
    title: "Soldadura MIG desde cero",
    outcome: "Practica cordones limpios y llévate una pieza hecha por ti.",
    instructor: "Instructor por confirmar",
    location: "Zapopan, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "6 horas",
    price: "$2,500",
    image: courseCoverUrl("soldadura-mig"),
    alt: "Chispas de soldadura iluminan una pieza metálica en un taller.",
    accent: "maker",
  },
  {
    slug: "comunicacion-profesional",
    category: "DOMINA SKILLS",
    title: "Comunicación profesional",
    outcome: "Expón tus ideas con claridad y gana confianza al hablar.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "3 horas",
    price: null,
    image: courseCoverUrl("comunicacion-profesional"),
    alt: "Personas conversando y aprendiendo en un espacio de trabajo compartido.",
    accent: "skills",
  },
];

export default function Home() {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(CATEGORY_ALL);
  const [search, setSearch] = useState("");
  const locale = i18n.language?.startsWith("en") ? "en" : "es-MX";

  const visibleCourses = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return courses.filter((course) => {
      const matchesCategory = activeCategory === CATEGORY_ALL || course.category === activeCategory;
      const matchesSearch =
        !term ||
        `${course.title} ${course.outcome} ${course.category} ${course.instructor}`
          .toLocaleLowerCase(locale)
          .includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, locale, search]);

  const filters: { id: CategoryFilter; label: string }[] = [
    { id: CATEGORY_ALL, label: t("catalog.all") },
    ...CATEGORY_OPTIONS.map((id) => ({ id, label: id })),
  ];

  return (
    <MarketingFrame
      onCategory={(category) => {
        setActiveCategory(category);
      }}
    >
      <PageMeta
        title={t("seo.defaultTitle")}
        titleAbsolute
        description={t("seo.defaultDescription")}
        path="/"
        keywords={t("seo.homeKeywords")}
        image={DOMINA_CDN_IMAGES.hero}
        imageAlt={t("home.heroLive")}
        jsonLd={homeJsonLd()}
      />
      <section className="domina-hero" id="inicio">
        <div className="domina-hero-copy">
          <p className="domina-eyebrow">
            <span /> {t("home.heroEyebrow").toUpperCase()}
          </p>
          <h1>
            {t("home.heroTitle1")}
            <br />
            {t("home.heroTitle2")}
            <br />
            <em>{t("home.heroTitle3")}</em>
          </h1>
          <p className="domina-hero-lede">{t("home.heroLede")}</p>
          <div className="domina-hero-actions">
            <a className="domina-button domina-button-dark" href="#cursos">
              {t("home.heroExplore")} <span aria-hidden="true">↘</span>
            </a>
            <a className="domina-text-link" href="#enseña">
              {t("home.heroTeach")} <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="domina-hero-note">
            <span className="domina-note-rule" />
            <span>
              {t("home.heroNote")} <strong>{t("home.heroNoteStrong")}</strong>
            </span>
          </div>
        </div>
        <div className="domina-hero-visual">
          <img
            className="domina-hero-image"
            src={DOMINA_CDN_IMAGES.hero}
            alt={t("home.heroLive")}
          />
          <div className="domina-image-label">
            <span className="domina-live-dot" />
            {t("home.heroLive").toUpperCase()}
          </div>
          <div className="domina-practice-stamp" aria-label={`${t("home.heroStampFrom")} ${t("home.heroStampTo")}`}>
            <span>{t("home.heroStampFrom")}</span>
            <small>A</small>
            <i />
            <span>{t("home.heroStampTo")}</span>
          </div>
          <div className="domina-hero-index">{t("home.heroIndex").toUpperCase()}</div>
        </div>
      </section>

      <section className="domina-category-strip" aria-label={t("home.categoryAria")}>
        <span>{t("home.categoryStrip").toUpperCase()}</span>
        <a className="category-link category-tech" href="#cursos" onClick={() => setActiveCategory("DOMINA TECH")}>
          <i /> DOMINA TECH <b>↗</b>
        </a>
        <a className="category-link category-maker" href="#cursos" onClick={() => setActiveCategory("DOMINA MAKER")}>
          <i /> DOMINA MAKER <b>↗</b>
        </a>
        <a className="category-link category-skills" href="#cursos" onClick={() => setActiveCategory("DOMINA SKILLS")}>
          <i /> DOMINA SKILLS <b>↗</b>
        </a>
      </section>

      <section className="domina-courses" id="cursos">
        <div className="domina-section-heading">
          <div>
            <p className="domina-eyebrow">{t("home.coursesEyebrow").toUpperCase()}</p>
            <h2>{t("home.coursesTitle")}</h2>
          </div>
          <label className="domina-search">
            <span className="search-mark" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("home.searchPlaceholder")}
              aria-label={t("home.searchAria")}
            />
          </label>
        </div>
        <div className="domina-filter-row" role="group" aria-label={t("home.filterAria")}>
          {filters.map((filter) => (
            <button
              className={`domina-filter ${activeCategory === filter.id ? "is-active" : ""}`}
              key={filter.id}
              onClick={() => setActiveCategory(filter.id)}
              type="button"
              aria-pressed={activeCategory === filter.id}
            >
              {filter.label}
            </button>
          ))}
          <span className="domina-filter-location">{t("home.priceNote").toUpperCase()}</span>
        </div>
        <div className="domina-course-grid" aria-live="polite">
          {visibleCourses.map((course, index) => {
            const soon = course.price === null;
            const body = (
              <>
                <div className="domina-course-image-wrap">
                  <img src={course.image} alt={course.alt} loading="lazy" />
                  <span className={`domina-course-tag ${course.accent}`}>{course.category}</span>
                  <span className="domina-course-number">0{index + 1}</span>
                </div>
                <div className="domina-course-content">
                  <div className="domina-course-topline">
                    <span>{course.duration}</span>
                    <span>
                      {soon ? t("home.comingSoon") : course.price} {!soon ? <small>MXN</small> : null}
                    </span>
                  </div>
                  <h3>{course.title}</h3>
                  <p className="domina-course-outcome">{course.outcome}</p>
                  <div className="domina-course-meta">
                    <span>{course.location}</span>
                    <span>{course.date}</span>
                  </div>
                  <div className="domina-course-footer">
                    <span>{t("home.withInstructor", { name: course.instructor })}</span>
                    {soon ? (
                      <span>{t("home.comingSoon")}</span>
                    ) : (
                      <span className="domina-course-cta">
                        {t("home.reserveSeat")} <span aria-hidden="true">↗</span>
                      </span>
                    )}
                  </div>
                </div>
              </>
            );
            return soon ? (
              <article className="domina-course-card is-soon" key={course.slug}>
                {body}
              </article>
            ) : (
              <Link
                className="domina-course-card is-clickable"
                key={course.slug}
                to={`/cursos/${course.slug}`}
                aria-label={`${course.title}. ${t("home.reserveSeat")}`}
              >
                {body}
              </Link>
            );
          })}
          {visibleCourses.length === 0 && (
            <div className="domina-empty-state">
              <p>{t("home.emptyCourses")}</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveCategory(CATEGORY_ALL);
                }}
              >
                {t("home.emptyReset")}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="domina-paths">
        <div className="domina-paths-copy">
          <p className="domina-eyebrow">{t("home.pathEyebrow").toUpperCase()}</p>
          <h2>
            {t("home.pathHeadline1")}
            <br />
            {t("home.pathHeadline2")}
          </h2>
          <p>{t("home.pathBodyShort")}</p>
        </div>
        <div className="domina-path-track" aria-label={t("home.pathAria")}>
          <span className="path-step is-complete">
            <small>01</small>Excel
          </span>
          <span className="path-connector" />
          <span className="path-step is-current">
            <small>02</small>Power BI
          </span>
          <span className="path-connector" />
          <span className="path-step">
            <small>03</small>SQL
          </span>
          <span className="path-connector" />
          <span className="path-step">
            <small>04</small>Python
          </span>
          <span className="path-name">
            DOMINA DATA <b>↗</b>
          </span>
        </div>
      </section>

      <section className="domina-business" id="empresas">
        <div className="domina-business-copy">
          <p className="domina-eyebrow">{t("home.businessEyebrow").toUpperCase()}</p>
          <h2>
            {t("home.businessTitle1")}
            <br />
            {t("home.businessTitle2")}
          </h2>
          <Link className="domina-button domina-button-light" to="/acceso/equipo">
            {t("home.businessCta")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="domina-business-aside">
          <span>01 / 03</span>
          <p style={{ whiteSpace: "pre-line" }}>{t("home.businessAside")}</p>
          <div className="business-mark" aria-hidden="true">
            D.
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
