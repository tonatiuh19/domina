-- DOMINA-owned coupons (not Stripe Promotion Codes). Discount is applied to
-- enrollments.amount_cents so card/OXXO/SPEI all charge the same final total.

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

ALTER TABLE enrollments ADD COLUMN coupon_id BIGINT NULL;
ALTER TABLE enrollments ADD COLUMN list_amount_cents INT NULL;
ALTER TABLE enrollments ADD COLUMN discount_cents INT NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD KEY idx_enrollments_coupon (coupon_id);
ALTER TABLE enrollments
  ADD CONSTRAINT fk_enrollments_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE SET NULL;

ALTER TABLE enrollments
  MODIFY COLUMN payment_method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo', 'coupon') NULL;

ALTER TABLE payments
  MODIFY COLUMN method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo', 'coupon') NOT NULL DEFAULT 'card';
