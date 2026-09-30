ALTER TABLE enrollments
  MODIFY COLUMN payment_method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo') NULL;

ALTER TABLE payments
  MODIFY COLUMN method ENUM('card', 'transfer', 'company_invoice', 'complimentary', 'oxxo') NOT NULL DEFAULT 'card';
