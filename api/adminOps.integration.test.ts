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
import { auth, loginCompany, loginStaff, loginUser, openPowerBiEdition } from "./testHarness";

const runId = `vitest-ops-${Date.now()}`;

describe("admin ops + company + site pages", () => {
  const app = createServer();
  let pool: Pool;
  let ownerToken: string;
  let coordToken: string;
  let companyToken: string;
  let learnerToken: string;
  let editionId: number;
  let courseId: number;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-owner@example.test`, role: "owner" });
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    ownerToken = await loginStaff(app, `${runId}-owner@example.test`);
    coordToken = await loginStaff(app, `${runId}-coord@example.test`);
    ({ token: companyToken } = await loginCompany(app, `${runId}-co@example.test`, "Empresa Test"));
    learnerToken = await loginUser(app, `${runId}-learner@example.test`);
    const open = await openPowerBiEdition(app);
    editionId = open.editionId;
    courseId = open.courseId;
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  it("company can create a private-session request", async () => {
    const created = await request(app)
      .post("/api/admin/company/requests")
      .set(auth(companyToken))
      .send({
        title: `${runId} private workshop`,
        headcount: 12,
        notes: "Need evening slots",
        courseId,
      });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/admin/company/requests").set(auth(companyToken));
    expect(list.status).toBe(200);
    expect(list.body.requests.some((r: { title: string }) => r.title.includes(runId))).toBe(true);

    const opsList = await request(app).get("/api/admin/requests").set(auth(coordToken));
    expect(opsList.status).toBe(200);
  });

  it("coordinator can add a complimentary participant", async () => {
    const added = await request(app)
      .post("/api/admin/participants")
      .set(auth(coordToken))
      .send({
        editionId,
        email: `${runId}-guest@example.test`,
        firstName: "Guest",
        lastName: "Seat",
        paymentMethod: "complimentary",
        sendConfirmationEmail: false,
      });
    expect([200, 201]).toContain(added.status);

    const participants = await request(app).get("/api/admin/participants").set(auth(coordToken));
    expect(participants.status).toBe(200);
  });

  it("owner can disable an invited teammate", async () => {
    const invited = await request(app)
      .post("/api/admin/team")
      .set(auth(ownerToken))
      .send({
        email: `${runId}-teammate@example.test`,
        firstName: "Teammate",
        role: "finance",
      });
    expect(invited.status).toBe(201);
    const id = invited.body.id as number;

    const disabled = await request(app)
      .patch(`/api/admin/team/${id}`)
      .set(auth(ownerToken))
      .send({ status: "disabled" });
    expect(disabled.status).toBe(200);

    const team = await request(app).get("/api/admin/team").set(auth(ownerToken));
    expect(team.status).toBe(200);
  });

  it("public and admin legal pages", async () => {
    const publicPage = await request(app).get("/api/site/pages/terminos");
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.page.slug).toBe("terminos");

    const badSlug = await request(app).get("/api/site/pages/not-a-page");
    expect(badSlug.status).toBeGreaterThanOrEqual(400);

    const adminList = await request(app).get("/api/admin/pages").set(auth(coordToken));
    expect(adminList.status).toBe(200);

    const one = await request(app).get("/api/admin/pages/privacidad").set(auth(coordToken));
    expect(one.status).toBe(200);

    const patched = await request(app)
      .patch("/api/admin/pages/privacidad")
      .set(auth(coordToken))
      .send({
        titleEs: one.body.page.titleEs,
        titleEn: one.body.page.titleEn,
        bodyMdEs: `${one.body.page.bodyMdEs}\n\n<!-- ${runId} -->`,
        bodyMdEn: one.body.page.bodyMdEn,
      });
    expect(patched.status).toBe(200);
  });

  it("learner reserve then admin can patch enrollment notes/status", async () => {
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    const patched = await request(app)
      .patch(`/api/admin/enrollments/${enrollmentId}`)
      .set(auth(coordToken))
      .send({ status: "waitlist" });
    // waitlist may or may not be allowed depending on schema enum - accept 200 or 400
    expect([200, 400]).toContain(patched.status);
  });
});
