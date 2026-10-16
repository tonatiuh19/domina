import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { createServer, expireStaleTransferPayments, markEnrollmentPaid } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginStaff, loginUser, openPowerBiEdition } from "./testHarness";

const runId = `vitest-xfer-${Date.now()}`;

describe("bank transfer (SPEI, non-Stripe)", () => {
  const app = createServer();
  let pool: Pool;
  let learnerToken: string;
  let ownerToken: string;
  let financeToken: string;
  let coordinatorToken: string;
  let instructorToken: string;
  let editionId: number;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-owner@example.test`, role: "owner" });
    await insertStaff(pool, { email: `${runId}-fin@example.test`, role: "finance" });
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    await insertStaff(pool, { email: `${runId}-inst@example.test`, role: "instructor" });
    ownerToken = await loginStaff(app, `${runId}-owner@example.test`);
    financeToken = await loginStaff(app, `${runId}-fin@example.test`);
    coordinatorToken = await loginStaff(app, `${runId}-coord@example.test`);
    instructorToken = await loginStaff(app, `${runId}-inst@example.test`);
    learnerToken = await loginUser(app, `${runId}-learner@example.test`);
    const open = await openPowerBiEdition(app);
    editionId = open.editionId;
  });

  afterAll(async () => {
    await pool.execute(
      `UPDATE site_bank_transfer_settings
          SET bank_name = 'BBVA México', expires_after_days = 3, is_enabled = 1
        WHERE id = 1`,
    );
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  async function reserveSeat(emailSuffix: string) {
    const token = await loginUser(app, `${runId}-${emailSuffix}@example.test`);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(token))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    return { token, enrollmentId: reserved.body.enrollmentId as number };
  }

  it("initiates transfer with DOMINA-{id} concept and bank details", async () => {
    const { token, enrollmentId } = await reserveSeat("init");
    const res = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_transfer");
    expect(res.body.reference).toBe(`DOMINA-${enrollmentId}`);
    expect(res.body.bank.clabe).toMatch(/^\d{18}$/);
    expect(res.body.paymentId).toBeGreaterThan(0);

    const detail = await request(app).get(`/api/portal/enrollments/${enrollmentId}`).set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.enrollment.paymentMethod).toBe("transfer");
    expect(detail.body.enrollment.transfer?.reference).toBe(`DOMINA-${enrollmentId}`);

    const checkout = await request(app)
      .post("/api/portal/checkout")
      .set(auth(token))
      .send({ enrollmentId });
    expect(checkout.status).toBe(200);
    expect(checkout.body.status).toBe("pending_transfer");
  });

  it("reuses an active transfer and lists it for finance", async () => {
    const { token, enrollmentId } = await reserveSeat("reuse");
    const first = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(second.status).toBe(200);
    expect(second.body.paymentId).toBe(first.body.paymentId);

    const list = await request(app)
      .get("/api/admin/transfers")
      .query({ status: "processing", search: `DOMINA-${enrollmentId}` })
      .set(auth(financeToken));
    expect(list.status).toBe(200);
    expect(list.body.transfers.some((row: { reference: string }) => row.reference === `DOMINA-${enrollmentId}`)).toBe(
      true,
    );
  });

  it("confirm marks seat paid; reject keeps enrollment pending", async () => {
    const paidSeat = await reserveSeat("confirm");
    const started = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(paidSeat.token))
      .send({ enrollmentId: paidSeat.enrollmentId });
    expect(started.status).toBe(200);
    const paymentId = started.body.paymentId as number;

    const denied = await request(app)
      .post(`/api/admin/transfers/${paymentId}/confirm`)
      .set(auth(instructorToken));
    expect(denied.status).toBe(403);

    const confirmed = await request(app)
      .post(`/api/admin/transfers/${paymentId}/confirm`)
      .set(auth(coordinatorToken));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.newlyPaid).toBe(true);

    const detail = await request(app)
      .get(`/api/portal/enrollments/${paidSeat.enrollmentId}`)
      .set(auth(paidSeat.token));
    expect(detail.body.enrollment.status).toBe("paid");
    expect(detail.body.enrollment.paymentMethod).toBe("transfer");

    const again = await request(app)
      .post(`/api/admin/transfers/${paymentId}/confirm`)
      .set(auth(ownerToken));
    expect(again.status).toBe(200);
    expect(again.body.newlyPaid).toBe(false);

    const rejectSeat = await reserveSeat("reject");
    const pending = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(rejectSeat.token))
      .send({ enrollmentId: rejectSeat.enrollmentId });
    expect(pending.status).toBe(200);
    const rejectId = pending.body.paymentId as number;

    const rejected = await request(app)
      .post(`/api/admin/transfers/${rejectId}/reject`)
      .set(auth(financeToken))
      .send({ reason: "amount mismatch" });
    expect(rejected.status).toBe(200);

    const afterReject = await request(app)
      .get(`/api/portal/enrollments/${rejectSeat.enrollmentId}`)
      .set(auth(rejectSeat.token));
    expect(afterReject.body.enrollment.status).toBe("pending");
    expect(afterReject.body.enrollment.paymentMethod).toBeNull();

    const [payments] = await pool.query<RowDataPacket[]>(
      "SELECT status, reject_reason FROM payments WHERE id = ?",
      [rejectId],
    );
    expect(payments[0].status).toBe("failed");
    expect(payments[0].reject_reason).toBe("amount mismatch");
  });

  it("expires stale transfers and reopens checkout", async () => {
    const { token, enrollmentId } = await reserveSeat("expire");
    const started = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(started.status).toBe(200);
    const paymentId = started.body.paymentId as number;

    await pool.execute(
      "UPDATE payments SET transfer_expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
      [paymentId],
    );
    const expiredCount = await expireStaleTransferPayments(enrollmentId);
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const detail = await request(app).get(`/api/portal/enrollments/${enrollmentId}`).set(auth(token));
    expect(detail.body.enrollment.status).toBe("pending");
    expect(detail.body.enrollment.paymentMethod).toBeNull();
    expect(detail.body.enrollment.transfer).toBeNull();

    const [payments] = await pool.query<RowDataPacket[]>(
      "SELECT status, reject_reason FROM payments WHERE id = ?",
      [paymentId],
    );
    expect(payments[0].status).toBe("failed");
    expect(payments[0].reject_reason).toBe("expired");
  });

  it("owner/finance/coordinator can patch bank settings; instructor cannot", async () => {
    const blocked = await request(app)
      .get("/api/admin/bank-transfer-settings")
      .set(auth(instructorToken));
    expect(blocked.status).toBe(403);

    const current = await request(app)
      .get("/api/admin/bank-transfer-settings")
      .set(auth(ownerToken));
    expect(current.status).toBe(200);
    const settings = current.body.settings;

    const patched = await request(app)
      .patch("/api/admin/bank-transfer-settings")
      .set(auth(financeToken))
      .send({
        ...settings,
        bankName: `BBVA ${runId}`,
        clabe: "012180001234567890",
        expiresAfterDays: 4,
        isEnabled: true,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.settings.bankName).toBe(`BBVA ${runId}`);
    expect(patched.body.settings.expiresAfterDays).toBe(4);

    const badClabe = await request(app)
      .patch("/api/admin/bank-transfer-settings")
      .set(auth(coordinatorToken))
      .send({
        ...settings,
        clabe: "123",
        expiresAfterDays: 3,
        isEnabled: true,
      });
    expect(badClabe.status).toBe(400);
  });

  it("returns 400 without enrollmentId and 409 when already paid", async () => {
    const bad = await request(app).post("/api/portal/checkout/transfer").set(auth(learnerToken)).send({});
    expect(bad.status).toBe(400);

    const { token, enrollmentId } = await reserveSeat("paid-edge");
    await request(app).post("/api/portal/checkout/simulate").set(auth(token)).send({ enrollmentId });
    const transfer = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(transfer.status).toBe(409);
    expect(transfer.body.code).toBe("already_paid");
  });

  it("returns 503 when bank transfer is disabled", async () => {
    await pool.execute("UPDATE site_bank_transfer_settings SET is_enabled = 0 WHERE id = 1");
    const { token, enrollmentId } = await reserveSeat("disabled");
    const res = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("transfer_disabled");
    await pool.execute("UPDATE site_bank_transfer_settings SET is_enabled = 1 WHERE id = 1");
  });

  it("preferStripe cancels an active SPEI hold", async () => {
    const { token, enrollmentId } = await reserveSeat("prefer-stripe");
    const started = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(started.status).toBe(200);
    const paymentId = started.body.paymentId as number;

    const checkout = await request(app)
      .post("/api/portal/checkout")
      .set(auth(token))
      .send({ enrollmentId, preferStripe: true });
    // Under VITEST Stripe is unavailable — after cancelling SPEI we get 503, not pending_transfer.
    expect(checkout.status).toBe(503);
    expect(checkout.body.status).not.toBe("pending_transfer");

    const [payments] = await pool.query<RowDataPacket[]>(
      "SELECT status, reject_reason FROM payments WHERE id = ?",
      [paymentId],
    );
    expect(payments[0].status).toBe("failed");
    expect(payments[0].reject_reason).toBe("switched_to_stripe");

    const detail = await request(app).get(`/api/portal/enrollments/${enrollmentId}`).set(auth(token));
    expect(detail.body.enrollment.paymentMethod).toBeNull();
    expect(detail.body.enrollment.transfer).toBeNull();
  });

  it("rejects SPEI confirm when enrollment was cancelled", async () => {
    const { token, enrollmentId } = await reserveSeat("cancel-confirm");
    const started = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(started.status).toBe(200);
    const paymentId = started.body.paymentId as number;

    await pool.execute("UPDATE enrollments SET status = 'cancelled' WHERE id = ?", [enrollmentId]);

    const confirmed = await request(app)
      .post(`/api/admin/transfers/${paymentId}/confirm`)
      .set(auth(financeToken));
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.code).toBe("seat_unavailable");

    const [enroll] = await pool.query<RowDataPacket[]>("SELECT status FROM enrollments WHERE id = ?", [enrollmentId]);
    expect(enroll[0].status).toBe("cancelled");
  });

  it("starting SPEI after OXXO supersedes the OXXO payment row", async () => {
    const { token, enrollmentId } = await reserveSeat("oxxo-mutex");
    const oxxo = await request(app)
      .post("/api/portal/checkout/simulate")
      .set(auth(token))
      .send({ enrollmentId, pendingOxxo: true });
    expect(oxxo.status).toBe(200);
    const oxxoSessionId = String(oxxo.body.sessionId);

    const [before] = await pool.query<RowDataPacket[]>(
      "SELECT id, method, status FROM payments WHERE stripe_checkout_session_id = ? LIMIT 1",
      [oxxoSessionId],
    );
    expect(before[0]?.method).toBe("oxxo");
    expect(before[0]?.status).toBe("processing");
    const oxxoPaymentId = Number(before[0].id);

    const transfer = await request(app)
      .post("/api/portal/checkout/transfer")
      .set(auth(token))
      .send({ enrollmentId });
    expect(transfer.status).toBe(200);
    expect(transfer.body.paymentId).not.toBe(oxxoPaymentId);

    const [oxxoRow] = await pool.query<RowDataPacket[]>(
      "SELECT status, reject_reason, stripe_checkout_session_id FROM payments WHERE id = ?",
      [oxxoPaymentId],
    );
    expect(oxxoRow[0].status).toBe("failed");
    expect(oxxoRow[0].reject_reason).toBe("switched_to_transfer");
    expect(oxxoRow[0].stripe_checkout_session_id).toBe(oxxoSessionId);

    // Late OXXO-style fulfill via the superseded session must not pay the seat.
    const late = await markEnrollmentPaid({
      enrollmentId,
      checkoutSessionId: oxxoSessionId,
      paymentIntentId: null,
      brand: null,
      last4: null,
      method: "oxxo",
    });
    expect(late.newlyPaid).toBe(false);

    const detail = await request(app).get(`/api/portal/enrollments/${enrollmentId}`).set(auth(token));
    expect(detail.body.enrollment.status).toBe("pending");
    expect(detail.body.enrollment.paymentMethod).toBe("transfer");
  });
});
