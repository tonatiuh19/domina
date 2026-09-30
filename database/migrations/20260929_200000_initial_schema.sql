-- DOMINA initial schema. TiDB Cloud Serverless / MySQL 8 compatible.
-- Learners, staff, and company buyers each have their own identity and session tables.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('app_version', '0.0.0', 'Current deployed application version shown in admin settings.')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(120) NOT NULL DEFAULT '',
  last_name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(40) NULL,
  audience ENUM('professional', 'student', 'general') NOT NULL DEFAULT 'professional',
  stripe_customer_id VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS user_login_codes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('login', 'register') NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_codes_email (email, created_at)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_sessions_token (token_hash),
  KEY idx_user_sessions_user (user_id),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(120) NOT NULL DEFAULT '',
  last_name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(40) NULL,
  role ENUM('owner', 'coordinator', 'instructor', 'finance') NOT NULL DEFAULT 'coordinator',
  status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admins_email (email)
);

CREATE TABLE IF NOT EXISTS admin_login_codes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('login') NOT NULL DEFAULT 'login',
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_codes_email (email, created_at)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_sessions_token (token_hash),
  KEY idx_admin_sessions_admin (admin_id),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companies (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(160) NOT NULL DEFAULT '',
  phone VARCHAR(40) NULL,
  stripe_customer_id VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_companies_email (email)
);

CREATE TABLE IF NOT EXISTS company_login_codes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('login', 'register') NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_company_codes_email (email, created_at)
);

CREATE TABLE IF NOT EXISTS company_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_sessions_token (token_hash),
  KEY idx_company_sessions_company (company_id),
  CONSTRAINT fk_company_sessions_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(160) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category ENUM('tech', 'maker', 'skills') NOT NULL,
  audience ENUM('open', 'company', 'student', 'general') NOT NULL DEFAULT 'open',
  level ENUM('intro', 'intermediate', 'advanced') NOT NULL DEFAULT 'intro',
  summary TEXT NOT NULL,
  promise VARCHAR(320) NOT NULL,
  duration_hours DECIMAL(4,1) NOT NULL DEFAULT 8.0,
  capacity INT NOT NULL DEFAULT 15,
  price_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  min_enrollment INT NOT NULL DEFAULT 8,
  practice_ratio TINYINT NOT NULL DEFAULT 70,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  city VARCHAR(80) NOT NULL DEFAULT 'Guadalajara',
  run_of_show TEXT NULL,
  materials TEXT NULL,
  safety_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_courses_slug (slug)
);

CREATE TABLE IF NOT EXISTS course_editions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  company_id BIGINT NULL,
  instructor_admin_id BIGINT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  venue_name VARCHAR(160) NOT NULL DEFAULT '',
  venue_address VARCHAR(255) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT 'Guadalajara',
  status ENUM('draft', 'presale', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'presale',
  capacity INT NOT NULL,
  price_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  min_enrollment INT NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_editions_course (course_id, starts_at),
  CONSTRAINT fk_editions_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT fk_editions_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
  CONSTRAINT fk_editions_instructor FOREIGN KEY (instructor_admin_id) REFERENCES admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  edition_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  company_id BIGINT NULL,
  status ENUM('pending', 'paid', 'waitlist', 'cancelled', 'attended', 'no_show') NOT NULL DEFAULT 'pending',
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  payment_method ENUM('card', 'transfer', 'company_invoice', 'complimentary') NULL,
  card_brand VARCHAR(40) NULL,
  card_last4 CHAR(4) NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment_seat (edition_id, user_id),
  KEY idx_enrollments_user (user_id),
  CONSTRAINT fk_enrollments_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id BIGINT NULL,
  user_id BIGINT NULL,
  company_id BIGINT NULL,
  edition_id BIGINT NULL,
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  status ENUM('requires_payment', 'processing', 'succeeded', 'failed', 'refunded') NOT NULL DEFAULT 'requires_payment',
  method ENUM('card', 'transfer', 'company_invoice', 'complimentary') NOT NULL DEFAULT 'card',
  card_brand VARCHAR(40) NULL,
  card_last4 CHAR(4) NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_checkout (stripe_checkout_session_id),
  KEY idx_payments_edition (edition_id),
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id BIGINT NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(800) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_feedback_enrollment (enrollment_id),
  CONSTRAINT fk_feedback_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS company_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  course_id BIGINT NULL,
  title VARCHAR(200) NOT NULL,
  headcount INT NOT NULL DEFAULT 10,
  notes TEXT NULL,
  status ENUM('new', 'quoted', 'scheduled', 'closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_company_requests_company (company_id),
  CONSTRAINT fk_company_requests_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_requests_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
);

INSERT INTO courses (
  slug, title, category, audience, level, summary, promise, duration_hours,
  capacity, price_cents, min_enrollment, practice_ratio, status, city, run_of_show, materials, safety_notes
) VALUES
(
  'mecanica-basica-para-mujeres',
  'Mecánica básica para mujeres',
  'maker', 'open', 'intro',
  'Revisiones y maniobras básicas del auto, con la mayor parte del tiempo bajo el cofre.',
  'Resuelve emergencias básicas con tu auto.',
  6.0, 15, 120000, 8, 70, 'published', 'Guadalajara',
  'Apertura corta, demostración del instructor, práctica en parejas, cierre con checklist personal.',
  'Gato, llave, guantes, lámpara. El taller aporta el vehículo de práctica.',
  'Guantes, calzado cerrado y pelo recogido. Sin práctica bajo un auto mal asegurado.'
),
(
  'power-bi-practico',
  'Power BI práctico',
  'tech', 'open', 'intro',
  'Un día para conectar datos, modelar lo mínimo y publicar un tablero usable.',
  'Construye tu primer dashboard en un día.',
  8.0, 15, 180000, 9, 70, 'published', 'Guadalajara',
  'Dataset compartido, modelo, 4 visuales, publicación. Cada participante sale con su archivo.',
  'Laptop con Power BI Desktop. Dataset de ejemplo incluido.',
  NULL
),
(
  'testing-de-software',
  'Testing de software',
  'tech', 'open', 'intro',
  'Casos, regresión y un reporte que un equipo de producto puede leer.',
  'Entrega un plan de pruebas sobre un producto real.',
  8.0, 15, 150000, 8, 70, 'published', 'Zapopan',
  'Exploración, casos, ejecución y reporte. Cierre con defectos priorizados.',
  'Laptop. Ambiente de práctica preparado por DOMINA.',
  NULL
),
(
  'ia-para-el-trabajo',
  'IA para el trabajo',
  'tech', 'open', 'intro',
  'Flujos concretos para investigar, redactar y revisar con criterio, no con prompts sueltos.',
  'Deja armado un flujo de trabajo que uses el lunes.',
  6.0, 15, 150000, 8, 70, 'published', 'Guadalajara',
  'Tres ejercicios sobre el trabajo real de cada participante y una plantilla de revisión.',
  'Laptop. No se pide cuenta de pago.',
  NULL
),
(
  'soldadura-mig',
  'Soldadura MIG',
  'maker', 'open', 'intro',
  'Preparación, cordón y una pieza terminada en un taller equipado.',
  'Fabrica una pieza soldada y te la llevas.',
  8.0, 10, 250000, 6, 75, 'published', 'Zapopan',
  'Seguridad, setup de máquina, cordones de práctica, pieza final.',
  'Careta, guantes y metal los aporta el taller. Ropa de algodón.',
  'EPP obligatorio. Extintor y ventilación verificados antes de abrir inscripción.'
),
(
  'comunicacion-profesional',
  'Comunicación profesional',
  'skills', 'open', 'intro',
  'Conversaciones difíciles, claridad y una práctica grabada. Precio y fecha se publican después del costeo.',
  'Conduce una conversación difícil con estructura.',
  5.0, 16, 0, 8, 60, 'draft', 'Guadalajara',
  'Guion, práctica en tríos, retroalimentación. No publicar fecha hasta entrevistas y costeo.',
  'Por definir.',
  NULL
)
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-10-18 09:00:00', '2026-10-18 17:00:00',
  'Salón de práctica DOMINA', 'Zapopan, Guadalajara', 'Guadalajara', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Edición piloto de preventa.'
FROM courses c
WHERE c.slug = 'power-bi-practico'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-10-18 09:00:00'
  );

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-11-08 09:00:00', '2026-11-08 15:00:00',
  'Taller aliado', 'Zapopan', 'Zapopan', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Edición piloto de preventa.'
FROM courses c
WHERE c.slug = 'mecanica-basica-para-mujeres'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-11-08 09:00:00'
  );
