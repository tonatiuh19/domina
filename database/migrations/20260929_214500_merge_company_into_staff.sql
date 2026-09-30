-- Merge company portal into staff: company buyers become admins with role=company.
-- TiDB: keep ALTER steps separate (ENUM modify already applied on some envs).

ALTER TABLE admins
  MODIFY COLUMN role ENUM('owner', 'coordinator', 'instructor', 'finance', 'company') NOT NULL DEFAULT 'coordinator';

ALTER TABLE admins
  ADD COLUMN company_id BIGINT NULL AFTER status;

ALTER TABLE admins
  ADD KEY idx_admins_company (company_id);

ALTER TABLE admins
  ADD CONSTRAINT fk_admins_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL;

INSERT INTO admins (email, first_name, last_name, role, status, company_id)
SELECT
  c.email,
  CASE
    WHEN TRIM(c.contact_name) = '' THEN 'Empresa'
    ELSE SUBSTRING_INDEX(TRIM(c.contact_name), ' ', 1)
  END,
  CASE
    WHEN TRIM(c.contact_name) = '' OR TRIM(c.contact_name) NOT LIKE '% %' THEN ''
    ELSE TRIM(SUBSTRING(TRIM(c.contact_name), LENGTH(SUBSTRING_INDEX(TRIM(c.contact_name), ' ', 1)) + 1))
  END,
  'company',
  'active',
  c.id
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM admins a WHERE a.email = c.email);

UPDATE admins a
  JOIN companies c ON c.email = a.email
   SET a.company_id = c.id
 WHERE a.company_id IS NULL
   AND a.role = 'company';

DROP TABLE IF EXISTS company_sessions;
DROP TABLE IF EXISTS company_login_codes;
