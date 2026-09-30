ALTER TABLE courses
  ADD COLUMN cover_image_url VARCHAR(500) NULL AFTER safety_notes;

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
