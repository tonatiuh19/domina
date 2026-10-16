import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createServer, markEnrollmentPaid } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  lookupCatalogIds,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginUser, openPowerBiEdition } from "./testHarness";

const runId = `vitest-enroll-${Date.now()}`;

describe("portal enrollments + payment fulfillment", () => {
  const app = createServer();
  let pool: Pool;
  let learnerToken: string;
  let learnerEmail: string;
  let editionId: number;
  let fullEditionId: number;
  const courseSlug = `${runId}-full`;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    learnerEmail = `${runId}-a@example.test`;
    learnerToken = await loginUser(app, learnerEmail);

    const open = await openPowerBiEdition(app);
    editionId = open.editionId;

    const ids = await lookupCatalogIds(pool);
    const [course] = await pool.execute<ResultSetHeader>(
      `INSERT INTO courses (
         slug, title, category_id, audience_id, level_id, summary, promise,
         duration_hours, capacity, price_cents, min_enrollment, practice_ratio, status, city_id
       ) VALUES (?, 'Full workshop', ?, ?, ?, 's', 'p', 4, 1, 10000, 1, 70, 'published', ?)`,
      [courseSlug, ids.categoryId, ids.audienceId, ids.levelId, ids.cityId],
    );
    const courseId = course.insertId;
    const starts = new Date(Date.now() + 7 * 86400000);
    const ends = new Date(starts.getTime() + 4 * 3600000);
    const [edition] = await pool.execute<ResultSetHeader>(
      `INSERT INTO course_editions (
         course_id, starts_at, ends_at, venue_id, capacity, price_cents, currency, status, min_enrollment
       ) VALUES (?, ?, ?, ?, 1, 10000, 'MXN', 'presale', 1)`,
      [courseId, starts, ends, ids.venueId],
    );
    fullEditionId = edition.insertId;

    // Occupy the only seat with another learner
    const fillerEmail = `${runId}-filler@example.test`;
    const fillerToken = await loginUser(app, fillerEmail);
    const held = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(fillerToken))
      .send({ editionId: fullEditionId });
    expect(held.status).toBe(201);
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId, courseSlugs: [courseSlug] });
    await pool.end();
  });

  it("reserves, resumes pending, and reports already paid", async () => {
    const first = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId });
    expect(first.status).toBe(201);
    const enrollmentId = first.body.enrollmentId as number;

    const resume = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId });
    expect(resume.status).toBe(200);
    expect(resume.body.resumed).toBe(true);
    expect(resume.body.enrollmentId).toBe(enrollmentId);

    const detail = await request(app)
      .get(`/api/portal/enrollments/${enrollmentId}`)
      .set(auth(learnerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.enrollment.id).toBe(enrollmentId);

    const paid = await request(app)
      .post("/api/portal/checkout/simulate")
      .set(auth(learnerToken))
      .send({ enrollmentId, brand: "visa", last4: "4242" });
    expect(paid.status).toBe(200);

    const again = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId });
    expect(again.status).toBe(200);
    expect(again.body.alreadyPaid).toBe(true);

    const list = await request(app).get("/api/portal/enrollments").set(auth(learnerToken));
    expect(list.body.enrollments.some((e: { id: number; status: string }) => e.id === enrollmentId && e.status === "paid")).toBe(
      true,
    );

    const recs = await request(app).get("/api/portal/recommendations").set(auth(learnerToken));
    expect(recs.status).toBe(200);
    expect(Array.isArray(recs.body.courses)).toBe(true);
  });

  it("returns 409 when edition is at capacity", async () => {
    const res = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId: fullEditionId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/full/i);
  });

  it("markEnrollmentPaid is idempotent and writes payments", async () => {
    const secondEmail = `${runId}-b@example.test`;
    const token = await loginUser(app, secondEmail);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(token))
      .send({ editionId });
    // May 201 or resume if somehow duplicate — prefer a fresh edition hold via open edition only once
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    const sessionId = `cs_test_${runId}_${enrollmentId}`;
    const first = await markEnrollmentPaid({
      enrollmentId,
      checkoutSessionId: sessionId,
      paymentIntentId: `pi_${enrollmentId}`,
      brand: "mastercard",
      last4: "4444",
      method: "card",
    });
    expect(first.newlyPaid).toBe(true);

    const second = await markEnrollmentPaid({
      enrollmentId,
      checkoutSessionId: sessionId,
      paymentIntentId: `pi_${enrollmentId}`,
      brand: "mastercard",
      last4: "4444",
      method: "card",
    });
    expect(second.newlyPaid).toBe(false);

    const [payments] = await pool.query<RowDataPacket[]>(
      "SELECT status, method, card_last4 FROM payments WHERE stripe_checkout_session_id = ?",
      [sessionId],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("succeeded");
    expect(payments[0].card_last4).toBe("4444");
  });

  it("checkout confirm/create return 503 under VITEST (no live Stripe)", async () => {
    const email = `${runId}-nostripe@example.test`;
    const token = await loginUser(app, email);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(token))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    const checkout = await request(app)
      .post("/api/portal/checkout")
      .set(auth(token))
      .send({ enrollmentId });
    expect(checkout.status).toBe(503);

    const confirm = await request(app)
      .post("/api/portal/checkout/confirm")
      .set(auth(token))
      .send({ sessionId: "cs_test_missing_session_xx" });
    expect(confirm.status).toBe(503);
  });

  it("records OXXO pending and still allows checkout restart under VITEST", async () => {
    const email = `${runId}-oxxo@example.test`;
    const token = await loginUser(app, email);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(token))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    const simulated = await request(app)
      .post("/api/portal/checkout/simulate")
      .set(auth(token))
      .send({ enrollmentId, pendingOxxo: true });
    expect(simulated.status).toBe(200);
    expect(simulated.body.status).toBe("pending_oxxo");

    const detail = await request(app).get(`/api/portal/enrollments/${enrollmentId}`).set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.enrollment.paymentMethod).toBe("oxxo");
    expect(detail.body.enrollment.status).toBe("pending");

    // No live Stripe in VITEST — reports pending_oxxo instead of minting a session.
    const first = await request(app).post("/api/portal/checkout").set(auth(token)).send({ enrollmentId });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("pending_oxxo");
    expect(first.body.enrollmentId).toBe(enrollmentId);

    const [payments] = await pool.query<RowDataPacket[]>(
      "SELECT status, method FROM payments WHERE enrollment_id = ? ORDER BY id DESC",
      [enrollmentId],
    );
    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(payments.some((row) => row.method === "oxxo" && row.status === "processing")).toBe(true);

    const emailed = await request(app)
      .post("/api/portal/checkout/oxxo-email")
      .set(auth(token))
      .send({ enrollmentId });
    expect(emailed.status).toBe(200);
    expect(emailed.body.ok).toBe(true);
    expect(emailed.body.skipped).toBe(true);

    const voucher = await request(app)
      .post("/api/portal/checkout/oxxo-voucher")
      .set(auth(token))
      .send({ enrollmentId });
    expect(voucher.status).toBe(200);
    expect(voucher.body.voucher?.url).toBeTruthy();
    expect(voucher.body.voucher?.amountCents).toBeGreaterThan(0);

    const missing = await request(app)
      .post("/api/portal/checkout/oxxo-email")
      .set(auth(token))
      .send({ enrollmentId: 99999999 });
    expect(missing.status).toBe(404);
  });

  it("accepts course feedback after payment", async () => {
    const seats = await request(app).get("/api/portal/enrollments").set(auth(learnerToken));
    const paid = (seats.body.enrollments || []).find((e: { status: string }) => e.status === "paid");
    expect(paid).toBeTruthy();
    const feedback = await request(app)
      .post("/api/portal/feedback")
      .set(auth(learnerToken))
      .send({ enrollmentId: paid.id, rating: 5, comment: "Excelente" });
    expect([200, 201]).toContain(feedback.status);
  });

  it("rejects invalid edition id", async () => {
    const res = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId: 99999999 });
    expect(res.status).toBe(404);
  });
});
