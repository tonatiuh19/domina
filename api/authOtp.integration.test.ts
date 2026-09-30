import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "mysql2/promise";
import { createServer, shouldSendLiveEmail } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginCompany, loginStaff, loginUser, requestUserOtp } from "./testHarness";

const runId = `vitest-otp-${Date.now()}`;
const learner = `${runId}-learner@example.test`;
const unknown = `${runId}-ghost@example.test`;
const staff = `${runId}-staff@example.test`;
const disabled = `${runId}-disabled@example.test`;

describe("auth OTP edge cases", () => {
  const app = createServer();
  let pool: Pool;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: staff, role: "coordinator" });
    await insertStaff(pool, { email: disabled, role: "instructor", status: "disabled" });
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  it("never sends live mail for fixture domains", () => {
    expect(shouldSendLiveEmail(learner)).toBe(false);
    expect(process.env.VITEST).toBe("true");
  });

  it("user check reports existence", async () => {
    const before = await request(app).post("/api/auth/user/check").send({ email: learner });
    expect(before.status).toBe(200);
    expect(before.body.exists).toBe(false);

    await loginUser(app, learner);

    const after = await request(app).post("/api/auth/user/check").send({ email: learner });
    expect(after.body.exists).toBe(true);
  });

  it("rejects signup without first name", async () => {
    const res = await request(app).post("/api/auth/user/request-otp").send({ email: unknown });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("profile_required");
  });

  it("rejects invalid or wrong OTP", async () => {
    const requested = await requestUserOtp(app, learner);
    expect(requested.status).toBe(200);

    const bad = await request(app).post("/api/auth/user/verify-otp").send({
      email: learner,
      code: "000000",
    });
    expect(bad.status).toBe(400);

    const malformed = await request(app).post("/api/auth/user/verify-otp").send({
      email: learner,
      code: "12",
    });
    expect(malformed.status).toBe(400);
  });

  it("updates profile, language, and logout", async () => {
    const token = await loginUser(app, learner);
    const patched = await request(app)
      .patch("/api/auth/user/me")
      .set(auth(token))
      .send({ firstName: "Ada", lastName: "Lovelace", audience: "student" });
    expect(patched.status).toBe(200);
    expect(patched.body.user.firstName).toBe("Ada");
    expect(patched.body.user.audience).toBe("student");

    const lang = await request(app).put("/api/auth/user/language").set(auth(token)).send({ language: "en" });
    expect(lang.status).toBe(200);

    const loggedOut = await request(app).post("/api/auth/user/logout").set(auth(token));
    expect(loggedOut.status).toBe(200);

    const me = await request(app).get("/api/auth/user/me").set(auth(token));
    expect(me.status).toBe(401);
  });

  it("staff check masks unknown/disabled accounts (no code leaked)", async () => {
    const exists = await request(app).post("/api/auth/admin/check").send({ email: staff });
    expect(exists.status).toBe(200);
    expect(exists.body.exists).toBe(true);

    const disabledOtp = await request(app).post("/api/auth/admin/request-otp").send({ email: disabled });
    expect(disabledOtp.status).toBe(200);
    expect(disabledOtp.body.devCode).toBeUndefined();

    const unknownOtp = await request(app)
      .post("/api/auth/admin/request-otp")
      .send({ email: `${runId}-not-on-team@example.test` });
    expect(unknownOtp.status).toBe(200);
    expect(unknownOtp.body.devCode).toBeUndefined();

    const token = await loginStaff(app, staff);
    const lang = await request(app).put("/api/auth/admin/language").set(auth(token)).send({ language: "en" });
    expect(lang.status).toBe(200);
    const out = await request(app).post("/api/auth/admin/logout").set(auth(token));
    expect(out.status).toBe(200);
  });

  it("company signup provisions company role", async () => {
    const companyEmail = `${runId}-co@example.test`;
    const { token, admin } = await loginCompany(app, companyEmail);
    expect(admin.role).toBe("company");
    expect(admin.companyId).toBeTruthy();
    const me = await request(app).get("/api/auth/admin/me").set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.admin.role).toBe("company");
  });
});
