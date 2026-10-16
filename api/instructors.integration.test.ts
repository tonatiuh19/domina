import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { createServer, notifyInstructorOfPaidEnrollment } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginStaff, loginUser, openPowerBiEdition } from "./testHarness";

const runId = `vitest-inst-${Date.now()}`;

describe("instructors + enrollment notifications", () => {
  const app = createServer();
  let pool: Pool;
  let ownerToken: string;
  let coordinatorToken: string;
  let instructorToken: string;
  let instructorId: number;
  let editionId: number;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-owner@example.test`, role: "owner" });
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    instructorId = await insertStaff(pool, {
      email: `${runId}-teacher@example.test`,
      role: "instructor",
      firstName: "Tina",
    });
    ownerToken = await loginStaff(app, `${runId}-owner@example.test`);
    coordinatorToken = await loginStaff(app, `${runId}-coord@example.test`);
    instructorToken = await loginStaff(app, `${runId}-teacher@example.test`);
    const open = await openPowerBiEdition(app);
    editionId = open.editionId;
  });

  afterAll(async () => {
    await pool.execute("UPDATE course_editions SET instructor_admin_id = NULL WHERE id = ?", [editionId]);
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  it("owner/coordinator can invite instructors; instructor cannot", async () => {
    const blocked = await request(app)
      .post("/api/admin/instructors")
      .set(auth(instructorToken))
      .send({ email: `${runId}-new@example.test`, firstName: "New" });
    expect(blocked.status).toBe(403);

    const invited = await request(app)
      .post("/api/admin/instructors")
      .set(auth(coordinatorToken))
      .send({
        email: `${runId}-new@example.test`,
        firstName: "Nora",
        lastName: "Docente",
      });
    expect(invited.status).toBe(201);

    const list = await request(app)
      .get("/api/admin/instructors")
      .query({ search: runId })
      .set(auth(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.instructors.some((row: { email: string }) => row.email.includes(runId))).toBe(true);
  });

  it("blocks inviting instructors via Equipo team endpoint", async () => {
    const res = await request(app)
      .post("/api/admin/team")
      .set(auth(ownerToken))
      .send({
        email: `${runId}-via-team@example.test`,
        firstName: "Wrong",
        role: "instructor",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("use_instructors_section");
  });

  it("assigns instructor to edition and exposes instructor roster", async () => {
    const patched = await request(app)
      .patch(`/api/admin/editions/${editionId}`)
      .set(auth(ownerToken))
      .send({ instructorAdminId: instructorId });
    expect(patched.status).toBe(200);

    const mine = await request(app).get("/api/instructor/editions").set(auth(instructorToken));
    expect(mine.status).toBe(200);
    expect(mine.body.editions.some((row: { id: number }) => row.id === editionId)).toBe(true);

    const denied = await request(app).get("/api/instructor/editions").set(auth(ownerToken));
    expect(denied.status).toBe(403);
  });

  it("notifies instructor on paid enrollment (email skipped under VITEST, in-app created)", async () => {
    const learnerToken = await loginUser(app, `${runId}-learner@example.test`);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(learnerToken))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    const paid = await request(app)
      .post("/api/portal/checkout/simulate")
      .set(auth(learnerToken))
      .send({ enrollmentId });
    expect(paid.status).toBe(200);

    const [notes] = await pool.query<RowDataPacket[]>(
      `SELECT id, kind, title FROM admin_notifications
        WHERE admin_id = ? AND enrollment_id = ?
        ORDER BY id DESC LIMIT 1`,
      [instructorId, enrollmentId],
    );
    expect(notes[0]?.kind).toBe("enrollment_paid");

    const inbox = await request(app).get("/api/admin/notifications").set(auth(instructorToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(inbox.body.notifications.some((n: { enrollmentId: number }) => n.enrollmentId === enrollmentId)).toBe(
      true,
    );

    const roster = await request(app)
      .get(`/api/instructor/editions/${editionId}/participants`)
      .set(auth(instructorToken));
    expect(roster.status).toBe(200);
    expect(roster.body.participants.some((p: { email: string }) => p.email.includes(runId))).toBe(true);

    // Idempotent helper path
    await notifyInstructorOfPaidEnrollment(enrollmentId, "card");
  });

  it("rejects invalid instructor assignment", async () => {
    const res = await request(app)
      .patch(`/api/admin/editions/${editionId}`)
      .set(auth(ownerToken))
      .send({ instructorAdminId: 999999991 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("instructor_invalid");
  });

  it("denies instructors on ops payments/participants APIs", async () => {
    for (const path of ["/api/admin/payments", "/api/admin/participants", "/api/admin/courses"]) {
      const res = await request(app).get(path).set(auth(instructorToken));
      expect(res.status).toBe(403);
    }
  });

  it("can disable an instructor and mark notifications read", async () => {
    const invited = await request(app)
      .post("/api/admin/instructors")
      .set(auth(ownerToken))
      .send({
        email: `${runId}-disable@example.test`,
        firstName: "Dana",
      });
    expect(invited.status).toBe(201);
    const newId = invited.body.id as number;

    const disabled = await request(app)
      .patch(`/api/admin/instructors/${newId}`)
      .set(auth(coordinatorToken))
      .send({ status: "disabled" });
    expect(disabled.status).toBe(200);

    const list = await request(app)
      .get("/api/admin/instructors")
      .query({ search: `${runId}-disable`, activeOnly: 1 })
      .set(auth(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body.instructors.some((row: { id: number }) => row.id === newId)).toBe(false);

    // Seed a notification for the primary instructor, then mark read.
    await pool.execute(
      `INSERT INTO admin_notifications (admin_id, kind, title, body, link_path)
       VALUES (?, 'enrollment_paid', 'Test note', 'Body', '/admin/mis-ediciones')`,
      [instructorId],
    );
    const inbox = await request(app).get("/api/admin/notifications").set(auth(instructorToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.unreadCount).toBeGreaterThanOrEqual(1);
    const noteId = inbox.body.notifications.find((n: { readAt: string | null }) => !n.readAt)?.id as number;
    expect(noteId).toBeGreaterThan(0);

    const one = await request(app)
      .post(`/api/admin/notifications/${noteId}/read`)
      .set(auth(instructorToken));
    expect(one.status).toBe(200);

    const all = await request(app)
      .post("/api/admin/notifications/read-all")
      .set(auth(instructorToken));
    expect(all.status).toBe(200);

    const after = await request(app).get("/api/admin/notifications").set(auth(instructorToken));
    expect(after.body.unreadCount).toBe(0);
  });

  it("suppresses duplicate paid notifications for the same enrollment", async () => {
    await request(app)
      .patch(`/api/admin/editions/${editionId}`)
      .set(auth(ownerToken))
      .send({ instructorAdminId: instructorId });

    const token = await loginUser(app, `${runId}-dedupe@example.test`);
    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set(auth(token))
      .send({ editionId });
    expect([200, 201]).toContain(reserved.status);
    const enrollmentId = reserved.body.enrollmentId as number;

    await request(app).post("/api/portal/checkout/simulate").set(auth(token)).send({ enrollmentId });

    const [first] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM admin_notifications
        WHERE admin_id = ? AND enrollment_id = ? AND kind = 'enrollment_paid'`,
      [instructorId, enrollmentId],
    );
    expect(Number(first[0].total)).toBe(1);

    await notifyInstructorOfPaidEnrollment(enrollmentId, "card");
    await notifyInstructorOfPaidEnrollment(enrollmentId, "oxxo");

    const [second] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM admin_notifications
        WHERE admin_id = ? AND enrollment_id = ? AND kind = 'enrollment_paid'`,
      [instructorId, enrollmentId],
    );
    expect(Number(second[0].total)).toBe(1);
  });
});
