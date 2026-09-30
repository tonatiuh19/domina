-- Catalog lookup tables for course category / level / audience / city.
-- Soft-deactivate via is_active; course tags deferred to a later migration.
-- Idempotent: safe to re-run after a partial apply.

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

INSERT INTO course_categories (slug, label, sort_order)
SELECT 'tech', 'Tech', 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'tech');
INSERT INTO course_categories (slug, label, sort_order)
SELECT 'maker', 'Maker', 20 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'maker');
INSERT INTO course_categories (slug, label, sort_order)
SELECT 'skills', 'Skills', 30 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_categories WHERE slug = 'skills');

INSERT INTO course_levels (slug, label, sort_order)
SELECT 'intro', 'Intro', 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'intro');
INSERT INTO course_levels (slug, label, sort_order)
SELECT 'intermediate', 'Intermedio', 20 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'intermediate');
INSERT INTO course_levels (slug, label, sort_order)
SELECT 'advanced', 'Avanzado', 30 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_levels WHERE slug = 'advanced');

INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'open', 'Abierto', 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'open');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'company', 'Empresa', 20 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'company');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'student', 'Estudiante', 30 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'student');
INSERT INTO course_audiences (slug, label, sort_order)
SELECT 'general', 'General', 40 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_audiences WHERE slug = 'general');

INSERT INTO course_cities (slug, label, sort_order)
SELECT 'guadalajara', 'Guadalajara', 10 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM course_cities WHERE slug = 'guadalajara');

INSERT INTO course_cities (slug, label, sort_order)
SELECT DISTINCT
  LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.city), 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), ' ', '-')),
  TRIM(c.city),
  100
FROM courses c
WHERE TRIM(IFNULL(c.city, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM course_cities x WHERE x.label = TRIM(c.city)
  );

-- Add FK columns one at a time (TiDB-friendly).
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD COLUMN category_id BIGINT NULL AFTER title',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'category_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD COLUMN audience_id BIGINT NULL AFTER category_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'audience_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD COLUMN level_id BIGINT NULL AFTER audience_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'level_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD COLUMN city_id BIGINT NULL AFTER status',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'city_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE courses c
INNER JOIN course_categories cat ON cat.slug = CAST(c.category AS CHAR)
SET c.category_id = cat.id
WHERE c.category_id IS NULL;

UPDATE courses c
INNER JOIN course_audiences a ON a.slug = CAST(c.audience AS CHAR)
SET c.audience_id = a.id
WHERE c.audience_id IS NULL;

UPDATE courses c
INNER JOIN course_levels l ON l.slug = CAST(c.level AS CHAR)
SET c.level_id = l.id
WHERE c.level_id IS NULL;

UPDATE courses c
INNER JOIN course_cities city ON city.label = c.city
SET c.city_id = city.id
WHERE c.city_id IS NULL;

UPDATE courses
SET city_id = (SELECT id FROM course_cities WHERE slug = 'guadalajara' LIMIT 1)
WHERE city_id IS NULL;

ALTER TABLE courses
  MODIFY COLUMN category_id BIGINT NOT NULL,
  MODIFY COLUMN audience_id BIGINT NOT NULL,
  MODIFY COLUMN level_id BIGINT NOT NULL,
  MODIFY COLUMN city_id BIGINT NOT NULL;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE courses DROP COLUMN category',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'category'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE courses DROP COLUMN audience',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'audience'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE courses DROP COLUMN level',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE courses DROP COLUMN city',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'city'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD CONSTRAINT fk_courses_category FOREIGN KEY (category_id) REFERENCES course_categories (id)',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND CONSTRAINT_NAME = 'fk_courses_category'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD CONSTRAINT fk_courses_audience FOREIGN KEY (audience_id) REFERENCES course_audiences (id)',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND CONSTRAINT_NAME = 'fk_courses_audience'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD CONSTRAINT fk_courses_level FOREIGN KEY (level_id) REFERENCES course_levels (id)',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND CONSTRAINT_NAME = 'fk_courses_level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE courses ADD CONSTRAINT fk_courses_city FOREIGN KEY (city_id) REFERENCES course_cities (id)',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND CONSTRAINT_NAME = 'fk_courses_city'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
