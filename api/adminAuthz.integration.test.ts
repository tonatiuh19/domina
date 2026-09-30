import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "mysql2/promise";
import { createServer } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginCompany, loginStaff, loginUser } from "./testHarness";

const runId = `vitest-authz-${Date.now()}`;

describe("admin authorization matrix", () => {
  const app = createServer();
  let pool: Pool;
  let ownerToken: string;
  let coordinatorToken: string;
  let instructorToken: string;
  let financeToken: string;
  let companyToken: string;
  let learnerToken: string;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-owner@example.test`, role: "owner" });
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    await insertStaff(pool, { email: `${runId}-inst@example.test`, role: "instructor" });
    await insertStaff(pool, { email: `${runId}-fin@example.test`, role: "finance" });
    ownerToken = await loginStaff(app, `${runId}-owner@example.test`);
    coordinatorToken = await loginStaff(app, `${runId}-coord@example.test`);
    instructorToken = await loginStaff(app, `${runId}-inst@example.test`);
    financeToken = await loginStaff(app, `${runId}-fin@example.test`);
    ({ token: companyToken } = await loginCompany(app, `${runId}-co@example.test`));
    learnerToken = await loginUser(app, `${runId}-learner@example.test`);
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  it("learners cannot access admin ops", async () => {
    const res = await request(app).get("/api/admin/dashboard").set(auth(learnerToken));
    expect(res.status).toBe(401);
  });

  it("company can hit company requests but not ops courses", async () => {
    const ok = await request(app).get("/api/admin/company/requests").set(auth(companyToken));
    expect(ok.status).toBe(200);
    const denied = await request(app).get("/api/admin/courses").set(auth(companyToken));
    expect(denied.status).toBe(403);
    const dash = await request(app).get("/api/admin/dashboard").set(auth(companyToken));
    expect(dash.status).toBe(403);
  });

  it("ops staff can read dashboard; instructor/finance cannot write catalog", async () => {
    for (const token of [ownerToken, coordinatorToken, instructorToken, financeToken]) {
      const dash = await request(app).get("/api/admin/dashboard").set(auth(token));
      expect(dash.status).toBe(200);
    }

    const instructorWrite = await request(app)
      .post("/api/admin/catalog/categories")
      .set(auth(instructorToken))
      .send({ label: `${runId} blocked`, slug: `${runId}-blocked` });
    expect(instructorWrite.status).toBe(403);

    const financeWrite = await request(app)
      .post("/api/admin/catalog/levels")
      .set(auth(financeToken))
      .send({ label: `${runId} blocked`, slug: `${runId}-lvl` });
    expect(financeWrite.status).toBe(403);

    const pages = await request(app).get("/api/admin/pages").set(auth(instructorToken));
    expect(pages.status).toBe(403);
  });

  it("only owner can invite team", async () => {
    const coordInvite = await request(app)
      .post("/api/admin/team")
      .set(auth(coordinatorToken))
      .send({
        email: `${runId}-invitee@example.test`,
        firstName: "Inv",
        role: "instructor",
      });
    expect(coordInvite.status).toBe(403);

    const ownerInvite = await request(app)
      .post("/api/admin/team")
      .set(auth(ownerToken))
      .send({
        email: `${runId}-invitee@example.test`,
        firstName: "Inv",
        role: "instructor",
      });
    expect(ownerInvite.status).toBe(201);
  });

  it("ops can list payments/participants/team/requests", async () => {
    for (const path of [
      "/api/admin/payments",
      "/api/admin/participants",
      "/api/admin/team",
      "/api/admin/requests",
      "/api/admin/editions",
    ]) {
      const res = await request(app).get(path).set(auth(coordinatorToken));
      expect(res.status).toBe(200);
    }
  });
});
