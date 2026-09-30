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
