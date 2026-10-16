-- Bank transfer (SPEI) settings + payment tracking. Not wired to Stripe.

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

INSERT INTO site_bank_transfer_settings (
  id, bank_name, account_holder, clabe, account_number, bank_code,
  instructions_es, instructions_en, expires_after_days, is_enabled
) VALUES (
  1,
  'BBVA México',
  'DOMINA Habilidades SA de CV',
  '012180001234567890',
  '0123456789',
  '012',
  'Transfiere el monto exacto por SPEI. En el concepto escribe exactamente el código que te mostramos (DOMINA-#####). El equipo confirma el pago y tu lugar queda asegurado.',
  'Transfer the exact amount via SPEI. In the payment concept write exactly the code we show you (DOMINA-#####). Our team confirms the transfer and your seat is locked.',
  3,
  1
)
ON DUPLICATE KEY UPDATE id = id;

ALTER TABLE payments ADD COLUMN transfer_reference VARCHAR(64) NULL;
ALTER TABLE payments ADD COLUMN transfer_expires_at DATETIME NULL;
ALTER TABLE payments ADD COLUMN confirmed_by_admin_id BIGINT NULL;
ALTER TABLE payments ADD COLUMN confirmed_at DATETIME NULL;
ALTER TABLE payments ADD COLUMN rejected_at DATETIME NULL;
ALTER TABLE payments ADD COLUMN reject_reason VARCHAR(400) NULL;
