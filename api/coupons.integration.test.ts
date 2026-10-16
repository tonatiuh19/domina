import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createServer, expireStaleCouponHolds } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  withDbRetry,
} from "./testDbCleanup";
import { loginStaff, loginUser, openPowerBiEdition } from "./testHarness";

const runId = `cpn${Date.now().toString(36)}`;
const pool = createIntegrationTestPool();

describe("coupons (DOMINA-owned)", () => {
  let app: Express;
  let ownerToken: string;
  let financeToken: string;
  let coordinatorToken: string;
  let courseId: number;
  let editionId: number;

  beforeAll(async () => {
    process.env.VITEST = "true";
    app = createServer();
    await withDbRetry(async () => {
      await insertStaff(pool, {
        email: `${runId}.owner@example.test`,
        role: "owner",
        firstName: "Owner",
      });
      await insertStaff(pool, {
        email: `${runId}.finance@example.test`,
        role: "finance",
        firstName: "Finance",
      });
      await insertStaff(pool, {
        email: `${runId}.coord@example.test`,
        role: "coordinator",
        firstName: "Coord",
      });
    });
    ownerToken = await loginStaff(app, `${runId}.owner@example.test`);
    financeToken = await loginStaff(app, `${runId}.finance@example.test`);
    coordinatorToken = await loginStaff(app, `${runId}.coord@example.test`);
    const edition = await openPowerBiEdition(app);
    courseId = edition.courseId;
    editionId = edition.editionId;
    // Parallel suites share this seeded edition — keep plenty of seats for coupon flows.
    await pool.execute("UPDATE course_editions SET capacity = GREATEST(capacity, 200) WHERE id = ?", [
      editionId,
    ]);
  }, 120_000);

  afterAll(async () => {
    await withDbRetry(async () => {
      await pool.query("DELETE FROM coupons WHERE code LIKE ?", [`${runId.toUpperCase()}%`]);
      await cleanupIntegrationTestFixtures(pool, { runId });
    });
    await pool.end();
  });

  async function reserveSeat(email: string) {
    const token = await loginUser(app, email, { firstName: "Learner", lastName: "Coupon" });
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set("Authorization", `Bearer ${token}`)
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    return { token, enrollmentId: Number(reserved.body.enrollmentId) };
  }

  it("owner/finance can create coupons; coordinator cannot", async () => {
    const denied = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${coordinatorToken}`)
      .send({
        code: `${runId}-DENY`,
        name: "Denied",
        discountType: "percent",
        percentOff: 10,
        scope: "all",
      });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({
        code: `${runId}-SAVE10`,
        name: "Save 10",
        discountType: "percent",
        percentOff: 10,
        scope: "all",
        maxRedemptions: 50,
      });
    expect(created.status).toBe(201);
    expect(created.body.coupon.code).toBe(`${runId.toUpperCase()}-SAVE10`);
  });

  it("applies 100% coupon, hides Stripe/SPEI, confirms free seat idempotently", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-FREE`,
        name: "Free seat",
        discountType: "percent",
        percentOff: 100,
        scope: "all",
      });

    const { token, enrollmentId } = await reserveSeat(`${runId}.free@example.test`);
    const applied = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-FREE` });
    expect(applied.status).toBe(200);
    expect(applied.body.free).toBe(true);

    const checkout = await request(app)
      .post("/api/portal/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, preferStripe: true });
    expect(checkout.status).toBe(409);
    expect(checkout.body.code).toBe("coupon_free");

    const transfer = await request(app)
      .post("/api/portal/checkout/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });
    expect(transfer.status).toBe(409);
    expect(transfer.body.code).toBe("coupon_free");

    const confirmed = await request(app)
      .post("/api/portal/checkout/confirm-free")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.newlyPaid).toBe(true);

    const again = await request(app)
      .post("/api/portal/checkout/confirm-free")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("already_paid");

    const [payments] = await pool.query<import("mysql2").RowDataPacket[]>(
      "SELECT id, stripe_checkout_session_id, amount_cents FROM payments WHERE enrollment_id = ? AND method = 'coupon' AND status = 'succeeded'",
      [enrollmentId],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].stripe_checkout_session_id).toBe(`coupon_free_${enrollmentId}`);
    expect(Number(payments[0].amount_cents)).toBe(0);
  });

  it("discounted SPEI hold uses the reduced amount", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-SPEI`,
        name: "SPEI cut",
        discountType: "fixed",
        amountOffCents: 50000,
        scope: "all",
      });

    const { token, enrollmentId } = await reserveSeat(`${runId}.spei@example.test`);
    const before = await request(app)
      .get(`/api/portal/enrollments/${enrollmentId}`)
      .set("Authorization", `Bearer ${token}`);
    const list = Number(before.body.enrollment.amountCents);
    expect(list).toBeGreaterThan(50000);

    const applied = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-SPEI` });
    expect(applied.status).toBe(200);
    expect(applied.body.amountCents).toBe(list - 50000);

    const transfer = await request(app)
      .post("/api/portal/checkout/transfer")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });
    expect(transfer.status).toBe(200);
    expect(transfer.body.amountCents).toBe(list - 50000);
    expect(transfer.body.status).toBe("pending_transfer");
  });

  it("enforces course/edition scope and date/active gates", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-COURSE`,
        name: "Course only",
        discountType: "percent",
        percentOff: 15,
        scope: "course",
        courseIds: [courseId],
      });
    // Scope miss: coupon tied to this course only — create a second coupon for a non-matching course id via raw insert after a dummy course? 
    // Instead, create an edition-scoped coupon for this edition, then assert a different code with empty mismatch by patching scopes away.
    const editionScoped = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-EDOK`,
        name: "This edition",
        discountType: "percent",
        percentOff: 15,
        scope: "edition",
        editionIds: [editionId],
      });
    expect(editionScoped.status).toBe(201);
    // Detach scope rows so the coupon remains edition-scoped but matches nothing.
    await pool.execute("DELETE FROM coupon_editions WHERE coupon_id = ?", [editionScoped.body.coupon.id]);

    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-FUTURE`,
        name: "Future",
        discountType: "percent",
        percentOff: 15,
        scope: "all",
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      });
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-PAST`,
        name: "Expired",
        discountType: "percent",
        percentOff: 15,
        scope: "all",
        endsAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      });
    const inactive = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-OFF`,
        name: "Off",
        discountType: "percent",
        percentOff: 15,
        scope: "all",
        active: false,
      });
    expect(inactive.status).toBe(201);

    const { token, enrollmentId } = await reserveSeat(`${runId}.scope@example.test`);

    const courseOk = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-COURSE` });
    expect(courseOk.status).toBe(200);

    await request(app)
      .delete("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });

    const editionOk = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-EDOK` });
    // Scope rows removed → coupon_scope
    expect(editionOk.status).toBe(409);
    expect(editionOk.body.code).toBe("coupon_scope");

    const future = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-FUTURE` });
    expect(future.status).toBe(409);
    expect(future.body.code).toBe("coupon_not_started");

    const past = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-PAST` });
    expect(past.status).toBe(409);
    expect(past.body.code).toBe("coupon_expired");

    const off = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-OFF` });
    expect(off.status).toBe(404);
    expect(off.body.code).toBe("coupon_inactive");
  });

  it("rejects confirm-free after coupon is deactivated", async () => {
    const created = await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-REVOKE`,
        name: "Revoke",
        discountType: "percent",
        percentOff: 100,
        scope: "all",
      });
    const couponId = Number(created.body.coupon.id);
    const { token, enrollmentId } = await reserveSeat(`${runId}.revoke@example.test`);
    await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId, code: `${runId}-REVOKE` });

    await request(app)
      .patch(`/api/admin/coupons/${couponId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ active: false });

    const confirm = await request(app)
      .post("/api/portal/checkout/confirm-free")
      .set("Authorization", `Bearer ${token}`)
      .send({ enrollmentId });
    expect(confirm.status).toBe(404);
    expect(confirm.body.code).toBe("coupon_inactive");
  });

  it("expires stale applied holds and restores list price", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-STALE`,
        name: "Stale",
        discountType: "fixed",
        amountOffCents: 10000,
        scope: "all",
        maxRedemptions: 1,
      });
    const a = await reserveSeat(`${runId}.stale@example.test`);
    const applied = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ enrollmentId: a.enrollmentId, code: `${runId}-STALE` });
    expect(applied.status).toBe(200);
    const discounted = applied.body.amountCents;

    await pool.execute(
      "UPDATE coupon_redemptions SET created_at = DATE_SUB(NOW(), INTERVAL 72 HOUR) WHERE enrollment_id = ?",
      [a.enrollmentId],
    );
    const released = await expireStaleCouponHolds(a.enrollmentId);
    expect(released).toBeGreaterThanOrEqual(1);

    const detail = await request(app)
      .get(`/api/portal/enrollments/${a.enrollmentId}`)
      .set("Authorization", `Bearer ${a.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.enrollment.couponId).toBeNull();
    expect(Number(detail.body.enrollment.amountCents)).toBeGreaterThan(discounted);

    // Inventory freed — same seat can apply the limited coupon again.
    const reapply = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ enrollmentId: a.enrollmentId, code: `${runId}-STALE` });
    expect(reapply.status).toBe(200);
    expect(reapply.body.amountCents).toBe(discounted);
  });

  it("allows remove/replace before pay and enforces max redemptions", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-ONCE`,
        name: "Once global",
        discountType: "fixed",
        amountOffCents: 10000,
        scope: "all",
        maxRedemptions: 1,
      });
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-ALT`,
        name: "Alt",
        discountType: "fixed",
        amountOffCents: 5000,
        scope: "all",
      });

    const a = await reserveSeat(`${runId}.swap@example.test`);
    const first = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ enrollmentId: a.enrollmentId, code: `${runId}-ALT` });
    expect(first.status).toBe(200);

    const removed = await request(app)
      .delete("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ enrollmentId: a.enrollmentId });
    expect(removed.status).toBe(200);

    const hold = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ enrollmentId: a.enrollmentId, code: `${runId}-ONCE` });
    expect(hold.status).toBe(200);

    const b = await reserveSeat(`${runId}.maxed@example.test`);
    const maxed = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${b.token}`)
      .send({ enrollmentId: b.enrollmentId, code: `${runId}-ONCE` });
    expect(maxed.status).toBe(409);
    expect(maxed.body.code).toBe("coupon_maxed");
  });

  it("enforces one redemption per learner after consume", async () => {
    await request(app)
      .post("/api/admin/coupons")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        code: `${runId}-USER1`,
        name: "Per user",
        discountType: "percent",
        percentOff: 100,
        scope: "all",
      });

    const first = await reserveSeat(`${runId}.userlimit@example.test`);
    await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${first.token}`)
      .send({ enrollmentId: first.enrollmentId, code: `${runId}-USER1` });
    const paid = await request(app)
      .post("/api/portal/checkout/confirm-free")
      .set("Authorization", `Bearer ${first.token}`)
      .send({ enrollmentId: first.enrollmentId });
    expect(paid.status).toBe(200);

    await pool.execute("UPDATE enrollments SET status = 'cancelled' WHERE id = ?", [first.enrollmentId]);
    const resumed = await request(app)
      .post("/api/portal/enrollments")
      .set("Authorization", `Bearer ${first.token}`)
      .send({ editionId });
    expect([200, 201]).toContain(resumed.status);
    const enrollmentId = Number(resumed.body.enrollmentId);

    const reuse = await request(app)
      .post("/api/portal/checkout/coupon")
      .set("Authorization", `Bearer ${first.token}`)
      .send({ enrollmentId, code: `${runId}-USER1` });
    expect(reuse.status).toBe(409);
    expect(reuse.body.code).toBe("coupon_user_limit");
  });
});
