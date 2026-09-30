import { useMemo, useState } from "react";

const categories = [
  "Todos",
  "DOMINA TECH",
  "DOMINA MAKER",
  "DOMINA SKILLS",
] as const;
type Category = (typeof categories)[number];

type Course = {
  category: Exclude<Category, "Todos">;
  title: string;
  outcome: string;
  instructor: string;
  location: string;
  date: string;
  duration: string;
  price: string;
  image: string;
  alt: string;
  accent: string;
};

const courses: Course[] = [
  {
    category: "DOMINA MAKER",
    title: "Mecánica básica para mujeres",
    outcome: "Diagnostica problemas comunes y entiende qué pasa bajo el cofre.",
    instructor: "Instructor por confirmar",
    location: "Zapopan, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "4 horas",
    price: "$1,200",
    image: "https://images.pexels.com/photos/8478259/pexels-photo-8478259.jpeg",
    alt: "Manos trabajando en el motor de un automóvil en un taller.",
    accent: "maker",
  },
  {
    category: "DOMINA TECH",
    title: "Power BI práctico",
    outcome:
      "Construye tu primer dashboard funcional, de los datos a la decisión.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "6 horas",
    price: "$1,800",
    image: "https://images.pexels.com/photos/5833762/pexels-photo-5833762.jpeg",
    alt: "Gráficos en pantalla durante una sesión de análisis de datos.",
    accent: "tech",
  },
  {
    category: "DOMINA TECH",
    title: "Testing de software",
    outcome: "Encuentra errores antes que tus usuarios y prueba con método.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "5 horas",
    price: "$1,500",
    image: "https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg",
    alt: "Especialista trabajando frente a herramientas digitales en su computadora.",
    accent: "tech",
  },
  {
    category: "DOMINA TECH",
    title: "IA para el trabajo",
    outcome: "Diseña un flujo de IA que te devuelva tiempo en tu día a día.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "4 horas",
    price: "$1,500",
    image: "https://images.pexels.com/photos/3184325/pexels-photo-3184325.jpeg",
    alt: "Equipo colaborando alrededor de una mesa en un taller práctico.",
    accent: "tech",
  },
  {
    category: "DOMINA MAKER",
    title: "Soldadura MIG desde cero",
    outcome: "Practica cordones limpios y llévate una pieza hecha por ti.",
    instructor: "Instructor por confirmar",
    location: "Zapopan, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "6 horas",
    price: "$2,500",
    image:
      "https://images.pexels.com/photos/13296053/pexels-photo-13296053.jpeg",
    alt: "Chispas de soldadura iluminan una pieza metálica en un taller.",
    accent: "maker",
  },
  {
    category: "DOMINA SKILLS",
    title: "Comunicación profesional",
    outcome: "Expón tus ideas con claridad y gana confianza al hablar.",
    instructor: "Instructor por confirmar",
    location: "Guadalajara, Jalisco",
    date: "Fecha y cupos por confirmar",
    duration: "3 horas",
    price: "Próximamente",
    image: "https://images.pexels.com/photos/3184436/pexels-photo-3184436.jpeg",
    alt: "Personas conversando y aprendiendo en un espacio de trabajo compartido.",
    accent: "skills",
  },
];

export function meta() {
  return [
    { title: "DOMINA — Aprende. Practica. Domina." },
    {
      name: "description",
      content:
        "Experiencias presenciales en Guadalajara para convertir conocimiento en habilidades reales.",
    },
  ];
}

export default function HomeRoute() {
  const [activeCategory, setActiveCategory] = useState<Category>("Todos");
  const [search, setSearch] = useState("");
  const visibleCourses = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return courses.filter((course) => {
      const matchesCategory =
        activeCategory === "Todos" || course.category === activeCategory;
      const matchesSearch =
        !term ||
        `${course.title} ${course.outcome} ${course.category} ${course.instructor}`
          .toLocaleLowerCase("es-MX")
          .includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  return (
    <div className="domina-site">
      <header className="domina-header">
        <a
          className="domina-wordmark"
          href="#inicio"
          aria-label="DOMINA, inicio"
        >
          DOMINA
        </a>
        <nav className="domina-nav" aria-label="Navegación principal">
          <a href="#cursos">Cursos</a>
          <a href="#empresas">Para empresas</a>
          <a href="#enseña">Enseña en DOMINA</a>
        </nav>
        <a className="domina-header-cta" href="#cursos">
          Encuentra tu curso <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main>
        <section className="domina-hero" id="inicio">
          <div className="domina-hero-copy">
            <p className="domina-eyebrow">
              <span /> GUADALAJARA · APRENDER HACIENDO
            </p>
            <h1>
              APRENDE.
              <br />
              PRACTICA.
              <br />
              <em>DOMINA.</em>
            </h1>
            <p className="domina-hero-lede">
              Experiencias presenciales para convertir conocimiento en
              habilidades reales.
            </p>
            <div className="domina-hero-actions">
              <a className="domina-button domina-button-dark" href="#cursos">
                Explorar cursos <span aria-hidden="true">↘</span>
              </a>
              <a className="domina-text-link" href="#enseña">
                Quiero enseñar <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="domina-hero-note">
              <span className="domina-note-rule" />
              <span>
                No solo aprendas. <strong>Hazlo.</strong>
              </span>
            </div>
          </div>
          <div className="domina-hero-visual">
            <img
              className="domina-hero-image"
              src="https://images.pexels.com/photos/13296053/pexels-photo-13296053.jpeg"
              alt="Chispas de soldadura durante una práctica de taller."
              fetchPriority="high"
            />
            <div className="domina-image-label">
              <span className="domina-live-dot" />
              APRENDIZAJE EN ACCIÓN
            </div>
            <div
              className="domina-practice-stamp"
              aria-label="De cero a hacerlo"
            >
              <span>De cero</span>
              <small>A</small>
              <i />
              <span>hacerlo.</span>
            </div>
            <div className="domina-hero-index">01 — APRENDE HACIENDO</div>
          </div>
        </section>

        <section
          className="domina-category-strip"
          aria-label="Explora por categoría"
        >
          <span>APRENDE LO QUE SIGUE</span>
          <a
            className="category-link category-tech"
            href="#cursos"
            onClick={() => setActiveCategory("DOMINA TECH")}
          >
            <i /> DOMINA TECH <b>↗</b>
          </a>
          <a
            className="category-link category-maker"
            href="#cursos"
            onClick={() => setActiveCategory("DOMINA MAKER")}
          >
            <i /> DOMINA MAKER <b>↗</b>
          </a>
          <a
            className="category-link category-skills"
            href="#cursos"
            onClick={() => setActiveCategory("DOMINA SKILLS")}
          >
            <i /> DOMINA SKILLS <b>↗</b>
          </a>
        </section>

        <section className="domina-courses" id="cursos">
          <div className="domina-section-heading">
            <div>
              <p className="domina-eyebrow">
                TU PRÓXIMA HABILIDAD EMPIEZA AQUÍ
              </p>
              <h2>Aprende haciendo.</h2>
            </div>
            <label className="domina-search">
              <span className="search-mark" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="¿Qué quieres dominar?"
                aria-label="Buscar cursos"
              />
            </label>
          </div>
          <div
            className="domina-filter-row"
            role="group"
            aria-label="Filtrar cursos por categoría"
          >
            {categories.map((category) => (
              <button
                className={`domina-filter ${activeCategory === category ? "is-active" : ""}`}
                key={category}
                onClick={() => setActiveCategory(category)}
                type="button"
                aria-pressed={activeCategory === category}
              >
                {category}
              </button>
            ))}
            <span className="domina-filter-location">
              PRECIOS ESTIMADOS · GDL + ZAPOPAN
            </span>
          </div>
          <div className="domina-course-grid" aria-live="polite">
            {visibleCourses.map((course, index) => (
              <article className="domina-course-card" key={course.title}>
                <div className="domina-course-image-wrap">
                  <img src={course.image} alt={course.alt} loading="lazy" />
                  <span className={`domina-course-tag ${course.accent}`}>
                    {course.category}
                  </span>
                  <span className="domina-course-number">0{index + 1}</span>
                </div>
                <div className="domina-course-content">
                  <div className="domina-course-topline">
                    <span>{course.duration}</span>
                    <span>
                      {course.price} <small>MXN</small>
                    </span>
                  </div>
                  <h3>{course.title}</h3>
                  <p className="domina-course-outcome">{course.outcome}</p>
                  <div className="domina-course-meta">
                    <span>{course.location}</span>
                    <span>{course.date}</span>
                  </div>
                  <div className="domina-course-footer">
                    <span>Con {course.instructor}</span>
                    <details className="domina-course-disclosure">
                      <summary>
                        Ver detalles <span aria-hidden="true">↗</span>
                      </summary>
                      <div>
                        <strong>Esto vas a dominar</strong>
                        <p>{course.outcome}</p>
                        <span>Materiales, horario y cupos: por confirmar.</span>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}
            {visibleCourses.length === 0 && (
              <div className="domina-empty-state">
                <p>No encontramos esa experiencia.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setActiveCategory("Todos");
                  }}
                >
                  Ver todos los cursos
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="domina-paths">
          <div className="domina-paths-copy">
            <p className="domina-eyebrow">SIGUE AVANZANDO</p>
            <h2>
              De cero
              <br />a hacerlo.
            </h2>
            <p>Una habilidad abre la puerta a la siguiente.</p>
          </div>
          <div
            className="domina-path-track"
            aria-label="Ruta DOMINA DATA: Excel, Power BI, SQL, Python"
          >
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
            <p className="domina-eyebrow">DOMINA FOR BUSINESS</p>
            <h2>
              Entrena a tu equipo
              <br />
              haciendo, no mirando.
            </h2>
            <a className="domina-button domina-button-light" href="#cursos">
              Explorar opciones para mi equipo <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="domina-business-aside">
            <span>01 / 03</span>
            <p>
              Talleres privados
              <br />
              Programas a medida
              <br />
              Objetivos concretos
            </p>
            <div className="business-mark" aria-hidden="true">
              D.
            </div>
          </div>
        </section>
      </main>

      <footer className="domina-footer" id="enseña">
        <div className="domina-footer-main">
          <div className="domina-footer-brand">
            <a className="domina-wordmark" href="#inicio">
              DOMINA
            </a>
            <p>APRENDE. PRACTICA. DOMINA.</p>
            <span>Habilidades reales, aprendidas haciendo.</span>
          </div>
          <div className="domina-footer-column">
            <h2>Explora</h2>
            <a href="#cursos" onClick={() => setActiveCategory("DOMINA TECH")}>
              DOMINA TECH <span>↗</span>
            </a>
            <a href="#cursos" onClick={() => setActiveCategory("DOMINA MAKER")}>
              DOMINA MAKER <span>↗</span>
            </a>
            <a
              href="#cursos"
              onClick={() => setActiveCategory("DOMINA SKILLS")}
            >
              DOMINA SKILLS <span>↗</span>
            </a>
          </div>
          <div className="domina-footer-column">
            <h2>Colabora</h2>
            <a href="#empresas">
              DOMINA for Business <span>↗</span>
            </a>
            <a href="#cursos">
              Enseña en DOMINA <span>↗</span>
            </a>
            <span>Guadalajara + Zapopan, MX</span>
          </div>
          <a
            className="domina-footer-backtop"
            href="#inicio"
            aria-label="Volver al inicio"
          >
            ↑
          </a>
        </div>
        <div className="domina-footer-bottom">
          <span>© {new Date().getFullYear()} DOMINA</span>
          <span>HECHO PARA APRENDER HACIENDO.</span>
          <a href="#inicio">Volver arriba ↑</a>
        </div>
      </footer>
    </div>
  );
}
