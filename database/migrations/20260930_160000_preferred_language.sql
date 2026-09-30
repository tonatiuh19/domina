ALTER TABLE users
  ADD COLUMN preferred_language ENUM('es', 'en') NULL AFTER audience;

ALTER TABLE admins
  ADD COLUMN preferred_language ENUM('es', 'en') NULL AFTER phone;
