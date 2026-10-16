-- In-app notifications for staff (instructor enrollment alerts, etc.)
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
