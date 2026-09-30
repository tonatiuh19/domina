-- Curated venues for editions (name + address + city). Soft-deactivate via is_active.
-- Idempotent: safe after a partial apply.

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

-- Extra distinct edition venues not already seeded (slug includes city to avoid collisions).
INSERT INTO course_venues (slug, label, address, city_id, sort_order)
SELECT
  LEFT(CONCAT(
    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(ed.venue_name), 'ñ','n'), 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), ' ', '-')),
    '-',
    city.slug,
    '-',
    ed.id
  ), 80),
  TRIM(ed.venue_name),
  TRIM(IFNULL(ed.venue_address, '')),
  city.id,
  100
FROM course_editions ed
JOIN course_cities city ON city.label = ed.city
WHERE TRIM(IFNULL(ed.venue_name, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM course_venues v
    WHERE v.label = TRIM(ed.venue_name) AND v.city_id = city.id
  )
GROUP BY TRIM(ed.venue_name), TRIM(IFNULL(ed.venue_address, '')), city.id, city.slug, ed.id;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE course_editions ADD COLUMN venue_id BIGINT NULL AFTER instructor_admin_id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_editions' AND COLUMN_NAME = 'venue_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE course_editions ed
INNER JOIN course_venues v ON v.label = ed.venue_name
INNER JOIN course_cities city ON city.id = v.city_id AND city.label = ed.city
SET ed.venue_id = v.id
WHERE ed.venue_id IS NULL;

UPDATE course_editions ed
INNER JOIN course_venues v ON v.label = ed.venue_name
SET ed.venue_id = v.id
WHERE ed.venue_id IS NULL;

UPDATE course_editions
SET venue_id = (SELECT id FROM course_venues ORDER BY sort_order ASC, id ASC LIMIT 1)
WHERE venue_id IS NULL
  AND EXISTS (SELECT 1 FROM course_venues LIMIT 1);

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE course_editions ADD CONSTRAINT fk_editions_venue FOREIGN KEY (venue_id) REFERENCES course_venues (id)',
    'SELECT 1'
  )
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'course_editions' AND CONSTRAINT_NAME = 'fk_editions_venue'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
