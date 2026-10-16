-- DOMINA initial schema. TiDB Cloud Serverless / MySQL 8 compatible.
-- Learners and staff each have their own identity and session tables.
-- Company buyers are staff with role=company (linked via admins.company_id).

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
  preferred_language ENUM('es', 'en') NULL,
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

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(120) NOT NULL DEFAULT '',
  last_name VARCHAR(120) NOT NULL DEFAULT '',
  phone VARCHAR(40) NULL,
  preferred_language ENUM('es', 'en') NULL,
  role ENUM('owner', 'coordinator', 'instructor', 'finance', 'company') NOT NULL DEFAULT 'coordinator',
  status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active',
  company_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admins_email (email),
  KEY idx_admins_company (company_id),
  CONSTRAINT fk_admins_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS course_categories (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_categories_slug (slug),
  KEY idx_course_categories_active (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS course_levels (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_levels_slug (slug),
  KEY idx_course_levels_active (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS course_audiences (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_audiences_slug (slug),
  KEY idx_course_audiences_active (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS course_cities (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_cities_slug (slug),
  KEY idx_course_cities_active (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(160) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category_id BIGINT NOT NULL,
  audience_id BIGINT NOT NULL,
  level_id BIGINT NOT NULL,
  summary TEXT NOT NULL,
  description_html MEDIUMTEXT NULL,
  promise VARCHAR(320) NOT NULL,
  duration_hours DECIMAL(4,1) NOT NULL DEFAULT 8.0,
  capacity INT NOT NULL DEFAULT 15,
  price_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  min_enrollment INT NOT NULL DEFAULT 8,
  practice_ratio TINYINT NOT NULL DEFAULT 70,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  city_id BIGINT NOT NULL,
  run_of_show TEXT NULL,
  materials TEXT NULL,
  safety_notes TEXT NULL,
  cover_image_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_courses_slug (slug),
  KEY idx_courses_category (category_id),
  KEY idx_courses_level (level_id),
  KEY idx_courses_city (city_id),
  CONSTRAINT fk_courses_category FOREIGN KEY (category_id) REFERENCES course_categories (id),
  CONSTRAINT fk_courses_audience FOREIGN KEY (audience_id) REFERENCES course_audiences (id),
  CONSTRAINT fk_courses_level FOREIGN KEY (level_id) REFERENCES course_levels (id),
  CONSTRAINT fk_courses_city FOREIGN KEY (city_id) REFERENCES course_cities (id)
);

CREATE TABLE IF NOT EXISTS course_gallery_images (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(200) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_course_gallery_course (course_id, sort_order),
  CONSTRAINT fk_course_gallery_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_venues (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',
  city_id BIGINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_venues_slug (slug),
  KEY idx_course_venues_active (is_active, sort_order),
  KEY idx_course_venues_city (city_id),
  CONSTRAINT fk_course_venues_city FOREIGN KEY (city_id) REFERENCES course_cities (id)
);

CREATE TABLE IF NOT EXISTS course_editions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT NOT NULL,
  company_id BIGINT NULL,
  instructor_admin_id BIGINT NULL,
  venue_id BIGINT NULL,
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
  CONSTRAINT fk_editions_instructor FOREIGN KEY (instructor_admin_id) REFERENCES admins (id) ON DELETE SET NULL,
  CONSTRAINT fk_editions_venue FOREIGN KEY (venue_id) REFERENCES course_venues (id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(400) NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  percent_off DECIMAL(5,2) NULL,
  amount_off_cents INT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  scope ENUM('all', 'course', 'edition') NOT NULL DEFAULT 'all',
  max_redemptions INT NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_admin_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupons_code (code),
  KEY idx_coupons_active_dates (active, starts_at, ends_at),
  CONSTRAINT fk_coupons_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admins (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coupon_courses (
  coupon_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  PRIMARY KEY (coupon_id, course_id),
  KEY idx_coupon_courses_course (course_id),
  CONSTRAINT fk_coupon_courses_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_courses_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coupon_editions (
  coupon_id BIGINT NOT NULL,
  edition_id BIGINT NOT NULL,
  PRIMARY KEY (coupon_id, edition_id),
  KEY idx_coupon_editions_edition (edition_id),
  CONSTRAINT fk_coupon_editions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_editions_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  edition_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  company_id BIGINT NULL,
  status ENUM('pending', 'paid', 'waitlist', 'cancelled', 'attended', 'no_show') NOT NULL DEFAULT 'pending',
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  payment_method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo', 'coupon') NULL,
  card_brand VARCHAR(40) NULL,
  card_last4 CHAR(4) NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  coupon_id BIGINT NULL,
  list_amount_cents INT NULL,
  discount_cents INT NOT NULL DEFAULT 0,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment_seat (edition_id, user_id),
  KEY idx_enrollments_user (user_id),
  KEY idx_enrollments_coupon (coupon_id),
  CONSTRAINT fk_enrollments_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_enrollments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
  CONSTRAINT fk_enrollments_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coupon_id BIGINT NOT NULL,
  enrollment_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  list_amount_cents INT NOT NULL,
  discount_cents INT NOT NULL,
  final_amount_cents INT NOT NULL,
  status ENUM('applied', 'consumed', 'released') NOT NULL DEFAULT 'applied',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupon_redemptions_enrollment (enrollment_id),
  KEY idx_coupon_redemptions_coupon_status (coupon_id, status),
  KEY idx_coupon_redemptions_user_coupon (user_id, coupon_id, status),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_redemptions_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link_path VARCHAR(255) NULL,
  enrollment_id BIGINT NULL,
  edition_id BIGINT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_notifications_inbox (admin_id, read_at, created_at),
  KEY idx_admin_notifications_edition (edition_id),
  CONSTRAINT fk_admin_notifications_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_notifications_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE SET NULL,
  CONSTRAINT fk_admin_notifications_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE SET NULL
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
  method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo', 'coupon') NOT NULL DEFAULT 'card',
  card_brand VARCHAR(40) NULL,
  card_last4 CHAR(4) NULL,
  stripe_checkout_session_id VARCHAR(255) NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  transfer_reference VARCHAR(64) NULL,
  transfer_expires_at DATETIME NULL,
  confirmed_by_admin_id BIGINT NULL,
  confirmed_at DATETIME NULL,
  rejected_at DATETIME NULL,
  reject_reason VARCHAR(400) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_checkout (stripe_checkout_session_id),
  KEY idx_payments_edition (edition_id),
  KEY idx_payments_transfer_queue (method, status, transfer_expires_at),
  KEY idx_payments_transfer_reference (transfer_reference),
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_edition FOREIGN KEY (edition_id) REFERENCES course_editions (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS site_bank_transfer_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  bank_name VARCHAR(120) NOT NULL,
  account_holder VARCHAR(200) NOT NULL,
  clabe VARCHAR(22) NOT NULL,
  account_number VARCHAR(40) NULL,
  bank_code VARCHAR(20) NULL,
  instructions_es TEXT NULL,
  instructions_en TEXT NULL,
  expires_after_days INT NOT NULL DEFAULT 3,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_admin_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_transfer_settings_admin FOREIGN KEY (updated_by_admin_id) REFERENCES admins (id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS site_pages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  title_es VARCHAR(200) NOT NULL,
  title_en VARCHAR(200) NOT NULL,
  body_md_es MEDIUMTEXT NOT NULL,
  body_md_en MEDIUMTEXT NOT NULL,
  updated_by_admin_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_site_pages_slug (slug),
  CONSTRAINT fk_site_pages_admin FOREIGN KEY (updated_by_admin_id) REFERENCES admins (id) ON DELETE SET NULL
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

INSERT INTO course_categories (slug, label, sort_order)
SELECT 'tech', 'Tech', 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'tech');
INSERT INTO course_categories (slug, label, sort_order)
SELECT 'maker', 'Maker', 20 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'maker');
INSERT INTO course_categories (slug, label, sort_order)
SELECT 'skills', 'Skills', 30 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'skills');

INSERT INTO course_levels (slug, label, sort_order)
SELECT 'intro', 'Intro', 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'intro');
INSERT INTO course_levels (slug, label, sort_order)
SELECT 'intermediate', 'Intermedio', 20 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'intermediate');
INSERT INTO course_levels (slug, label, sort_order)
SELECT 'advanced', 'Avanzado', 30 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'advanced');

INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'open', 'Abierto', 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'open');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'company', 'Empresa', 20 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'company');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'student', 'Estudiante', 30 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'student');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'general', 'General', 40 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'general');

INSERT INTO course_cities (slug, label, sort_order)
SELECT 'guadalajara', 'Guadalajara', 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_cities WHERE slug = 'guadalajara');
INSERT INTO course_cities (slug, label, sort_order)
SELECT 'zapopan', 'Zapopan', 20 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM course_cities WHERE slug = 'zapopan');

INSERT INTO course_venues (slug, label, address, city_id, sort_order)
SELECT 'salon-de-practica-domina', 'Salón de práctica DOMINA', 'Guadalajara', c.id, 10
FROM course_cities c
WHERE c.slug = 'guadalajara'
  AND NOT EXISTS (SELECT 1 FROM course_venues WHERE slug = 'salon-de-practica-domina');
INSERT INTO course_venues (slug, label, address, city_id, sort_order)
SELECT 'taller-aliado-zapopan', 'Taller aliado', 'Zapopan', c.id, 20
FROM course_cities c
WHERE c.slug = 'zapopan'
  AND NOT EXISTS (SELECT 1 FROM course_venues WHERE slug = 'taller-aliado-zapopan');

INSERT INTO courses (
  slug, title, category_id, audience_id, level_id, summary, promise, duration_hours,
  capacity, price_cents, min_enrollment, practice_ratio, status, city_id, run_of_show, materials, safety_notes
)
SELECT
  seed.slug, seed.title, cat.id, aud.id, lvl.id, seed.summary, seed.promise, seed.duration_hours,
  seed.capacity, seed.price_cents, seed.min_enrollment, seed.practice_ratio, seed.status, city.id,
  seed.run_of_show, seed.materials, seed.safety_notes
FROM (
  SELECT
    'mecanica-basica-para-mujeres' AS slug,
    'Mecánica básica para mujeres' AS title,
    'maker' AS category_slug, 'open' AS audience_slug, 'intro' AS level_slug, 'guadalajara' AS city_slug,
    'Revisiones y maniobras básicas del auto, con la mayor parte del tiempo bajo el cofre.' AS summary,
    'Resuelve emergencias básicas con tu auto.' AS promise,
    6.0 AS duration_hours, 15 AS capacity, 120000 AS price_cents, 8 AS min_enrollment, 70 AS practice_ratio,
    'published' AS status,
    'Apertura corta, demostración del instructor, práctica en parejas, cierre con checklist personal.' AS run_of_show,
    'Gato, llave, guantes, lámpara. El taller aporta el vehículo de práctica.' AS materials,
    'Guantes, calzado cerrado y pelo recogido. Sin práctica bajo un auto mal asegurado.' AS safety_notes
  UNION ALL SELECT
    'power-bi-practico', 'Power BI práctico', 'tech', 'open', 'intro', 'guadalajara',
    'Un día para conectar datos, modelar lo mínimo y publicar un tablero usable.',
    'Construye tu primer dashboard en un día.',
    8.0, 15, 180000, 9, 70, 'published',
    'Dataset compartido, modelo, 4 visuales, publicación. Cada participante sale con su archivo.',
    'Laptop con Power BI Desktop. Dataset de ejemplo incluido.', NULL
  UNION ALL SELECT
    'testing-de-software', 'Testing de software', 'tech', 'open', 'intro', 'zapopan',
    'Casos, regresión y un reporte que un equipo de producto puede leer.',
    'Entrega un plan de pruebas sobre un producto real.',
    8.0, 15, 150000, 8, 70, 'published',
    'Exploración, casos, ejecución y reporte. Cierre con defectos priorizados.',
    'Laptop. Ambiente de práctica preparado por DOMINA.', NULL
  UNION ALL SELECT
    'ia-para-el-trabajo', 'IA para el trabajo', 'tech', 'open', 'intro', 'guadalajara',
    'Flujos concretos para investigar, redactar y revisar con criterio, no con prompts sueltos.',
    'Deja armado un flujo de trabajo que uses el lunes.',
    6.0, 15, 150000, 8, 70, 'published',
    'Tres ejercicios sobre el trabajo real de cada participante y una plantilla de revisión.',
    'Laptop. No se pide cuenta de pago.', NULL
  UNION ALL SELECT
    'soldadura-mig', 'Soldadura MIG', 'maker', 'open', 'intro', 'zapopan',
    'Preparación, cordón y una pieza terminada en un taller equipado.',
    'Fabrica una pieza soldada y te la llevas.',
    8.0, 10, 250000, 6, 75, 'published',
    'Seguridad, setup de máquina, cordones de práctica, pieza final.',
    'Careta, guantes y metal los aporta el taller. Ropa de algodón.',
    'EPP obligatorio. Extintor y ventilación verificados antes de abrir inscripción.'
  UNION ALL SELECT
    'comunicacion-profesional', 'Comunicación profesional', 'skills', 'open', 'intro', 'guadalajara',
    'Conversaciones difíciles, claridad y una práctica grabada. Precio y fecha se publican después del costeo.',
    'Conduce una conversación difícil con estructura.',
    5.0, 16, 0, 8, 60, 'draft',
    'Guion, práctica en tríos, retroalimentación. No publicar fecha hasta entrevistas y costeo.',
    'Por definir.', NULL
) AS seed
JOIN course_categories cat ON cat.slug = seed.category_slug
JOIN course_audiences aud ON aud.slug = seed.audience_slug
JOIN course_levels lvl ON lvl.slug = seed.level_slug
JOIN course_cities city ON city.slug = seed.city_slug
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

INSERT INTO admins (email, first_name, last_name, role, status)
VALUES ('tonatiuh@boolean-tech.com', 'Tonatiuh', 'Gomez', 'owner', 'active')
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  role = 'owner',
  status = 'active';

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-10-25 09:00:00', '2026-10-25 17:00:00',
  'Salón de práctica DOMINA', 'Guadalajara', 'Zapopan', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Edición de prueba para reservas.'
FROM courses c
WHERE c.slug = 'testing-de-software'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-10-25 09:00:00'
  );

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-11-15 09:00:00', '2026-11-15 15:00:00',
  'Salón de práctica DOMINA', 'Guadalajara', 'Guadalajara', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Edición de prueba para reservas.'
FROM courses c
WHERE c.slug = 'ia-para-el-trabajo'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-11-15 09:00:00'
  );

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-11-22 09:00:00', '2026-11-22 17:00:00',
  'Taller aliado', 'Zapopan', 'Zapopan', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Edición de prueba para reservas.'
FROM courses c
WHERE c.slug = 'soldadura-mig'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-11-22 09:00:00'
  );

INSERT INTO course_editions (
  course_id, starts_at, ends_at, venue_name, venue_address, city, status,
  capacity, price_cents, min_enrollment, notes
)
SELECT c.id, '2026-12-06 09:00:00', '2026-12-06 17:00:00',
  'Salón de práctica DOMINA', 'Guadalajara', 'Guadalajara', 'presale',
  c.capacity, c.price_cents, c.min_enrollment, 'Segunda edición de prueba.'
FROM courses c
WHERE c.slug = 'power-bi-practico'
  AND NOT EXISTS (
    SELECT 1 FROM course_editions e
    WHERE e.course_id = c.id AND e.starts_at = '2026-12-06 09:00:00'
  );

UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/mecanica-basica-para-mujeres/main_image/6abc7f373fa5d_1790738231.jpg'
WHERE slug = 'mecanica-basica-para-mujeres';
UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/power-bi-practico/main_image/6abc7f39043a6_1790738233.jpg'
WHERE slug = 'power-bi-practico';
UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/testing-de-software/main_image/6abc7f3aa6760_1790738234.jpg'
WHERE slug = 'testing-de-software';
UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/ia-para-el-trabajo/main_image/6abc7f3ce8a73_1790738236.jpg'
WHERE slug = 'ia-para-el-trabajo';
UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/soldadura-mig/main_image/6abc7f3e9da69_1790738238.jpg'
WHERE slug = 'soldadura-mig';
UPDATE courses SET cover_image_url = 'https://disruptinglabs.com/data/api/data/domina/comunicacion-profesional/main_image/6abc7f406c826_1790738240.jpg'
WHERE slug = 'comunicacion-profesional';

