-- Indexes for bank-transfer queue lookups
ALTER TABLE payments ADD KEY idx_payments_transfer_queue (method, status, transfer_expires_at);
ALTER TABLE payments ADD KEY idx_payments_transfer_reference (transfer_reference);
