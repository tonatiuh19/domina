ALTER TABLE courses
  ADD COLUMN description_html MEDIUMTEXT NULL AFTER summary;

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

UPDATE courses
   SET description_html = '<h2>Qué vas a construir</h2><p>En un día conectas datos reales, modelas lo mínimo y publicas un <strong>tablero usable</strong> que alguien más pueda leer sin explicarte al lado.</p><ul><li>Importar y limpiar una fuente</li><li>Relaciones y medidas básicas</li><li>Visuales que responden a una pregunta de negocio</li></ul><blockquote>No es un tour de botones. Sales con un dashboard que puedes defender.</blockquote><h2>Para quién</h2><p>Analistas, operaciones, finanzas o cualquiera que ya mueva Excel y quiera pasar a decisiones en vivo.</p>'
 WHERE slug = 'power-bi-practico';

INSERT INTO course_gallery_images (course_id, image_url, caption, sort_order)
SELECT c.id, c.cover_image_url, 'Sesión de práctica', 0
  FROM courses c
 WHERE c.slug = 'power-bi-practico' AND c.cover_image_url IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM course_gallery_images g WHERE g.course_id = c.id
   );

INSERT INTO course_gallery_images (course_id, image_url, caption, sort_order)
SELECT c.id,
       'https://disruptinglabs.com/data/api/data/domina/ia-para-el-trabajo/main_image/6abc7f3ce8a73_1790738236.jpg',
       'Trabajo en equipo alrededor de los datos',
       1
  FROM courses c
 WHERE c.slug = 'power-bi-practico'
   AND NOT EXISTS (
     SELECT 1 FROM course_gallery_images g WHERE g.course_id = c.id AND g.sort_order = 1
   );

INSERT INTO course_gallery_images (course_id, image_url, caption, sort_order)
SELECT c.id,
       'https://disruptinglabs.com/data/api/data/domina/testing-de-software/main_image/6abc7f3aa6760_1790738234.jpg',
       'Espacio de práctica DOMINA',
       2
  FROM courses c
 WHERE c.slug = 'power-bi-practico'
   AND NOT EXISTS (
     SELECT 1 FROM course_gallery_images g WHERE g.course_id = c.id AND g.sort_order = 2
   );
