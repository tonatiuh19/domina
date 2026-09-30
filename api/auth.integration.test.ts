import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import mysql from "mysql2/promise";
import { createServer, shouldSendLiveEmail } from "./index";

const run = `vitest-${Date.now()}`;
const learner = `${run}-learner@example.test`;
const staff = `${run}-staff@example.test`;
const company = `${run}-co@example.test`;

async function purge() {
  if (!process.env.DB_HOST) return;
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    connectionLimit: 2,
  });
  try {
    await pool.query("DELETE FROM users WHERE email LIKE ?", [`${run}%`]);
    await pool.query("DELETE FROM admins WHERE email LIKE ?", [`${run}%`]);
    await pool.query("DELETE FROM companies WHERE email LIKE ?", [`${run}%`]);
  } finally {
    await pool.end();
  }
}

describe("passwordless sessions", () => {
  const app = createServer();

  afterAll(async () => {
    await purge();
  });

  it("never sends live mail from the test suite", () => {
    expect(shouldSendLiveEmail(learner)).toBe(false);
    expect(process.env.VITEST).toBe("true");
  });

  it("keeps learner and staff sessions in different tables", async () => {
    const requested = await request(app).post("/api/auth/user/request-otp").send({
      email: learner,
      firstName: "Ada",
      lastName: "Prueba",
      audience: "professional",
    });
    expect(requested.status).toBe(200);
    expect(requested.body.devCode).toMatch(/^\d{6}$/);

    const verified = await request(app).post("/api/auth/user/verify-otp").send({
      email: learner,
      code: requested.body.devCode,
    });
    expect(verified.status).toBe(200);
    const userToken = verified.body.token as string;

    const me = await request(app).get("/api/auth/user/me").set("Authorization", `Bearer ${userToken}`);
    expect(me.body.user.email).toBe(learner);

    const staffGate = await request(app).get("/api/auth/admin/me").set("Authorization", `Bearer ${userToken}`);
    expect(staffGate.status).toBe(401);

    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 4000),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    });
    await pool.execute(
      "INSERT INTO admins (email, first_name, role, status) VALUES (?, 'Ops', 'coordinator', 'active')",
      [staff],
    );
    await pool.end();

    const staffCode = await request(app).post("/api/auth/admin/request-otp").send({ email: staff });
    expect(staffCode.body.devCode).toMatch(/^\d{6}$/);
    const staffSession = await request(app)
      .post("/api/auth/admin/verify-otp")
      .send({ email: staff, code: staffCode.body.devCode });
    expect(staffSession.status).toBe(200);

    const learnerWithStaff = await request(app)
      .get("/api/auth/user/me")
      .set("Authorization", `Bearer ${staffSession.body.token}`);
    expect(learnerWithStaff.status).toBe(401);

    const catalog = await request(app).get("/api/catalog/courses");
    expect(catalog.status).toBe(200);
    const powerBi = catalog.body.courses.find((course: { slug: string }) => course.slug === "power-bi-practico");
    expect(powerBi.editions.length).toBeGreaterThan(0);

    const reserved = await request(app)
      .post("/api/portal/enrollments")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ editionId: powerBi.editions[0].id });
    expect(reserved.status).toBe(201);

    const paid = await request(app)
      .post("/api/portal/checkout/simulate")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ enrollmentId: reserved.body.enrollmentId, brand: "visa", last4: "4242" });
    expect(paid.status).toBe(200);

    const seats = await request(app).get("/api/portal/enrollments").set("Authorization", `Bearer ${userToken}`);
    const seat = seats.body.enrollments.find((item: { id: number }) => item.id === reserved.body.enrollmentId);
    expect(seat.status).toBe("paid");
    expect(seat.cardLast4).toBe("4242");
    expect(seat.paymentMethod).toBe("card");

    const roster = await request(app)
      .get(`/api/admin/courses/${powerBi.id}`)
      .query({ editionId: powerBi.editions[0].id })
      .set("Authorization", `Bearer ${staffSession.body.token}`);
    expect(roster.status).toBe(200);
    expect(roster.body.participants.some((person: { email: string }) => person.email === learner)).toBe(true);

    const companyCode = await request(app).post("/api/auth/admin/request-otp").send({
      email: company,
      companyName: "Taller Norte",
      contactName: "Luz",
    });
    expect(companyCode.body.devCode).toMatch(/^\d{6}$/);
    const companySession = await request(app)
      .post("/api/auth/admin/verify-otp")
      .send({ email: company, code: companyCode.body.devCode });
    expect(companySession.status).toBe(200);
    expect(companySession.body.admin.role).toBe("company");
    expect(companySession.body.admin.companyId).toBeTruthy();

    const opsDenied = await request(app)
      .get("/api/admin/courses")
      .set("Authorization", `Bearer ${companySession.body.token}`);
    expect(opsDenied.status).toBe(403);

    const companyRequests = await request(app)
      .get("/api/admin/company/requests")
      .set("Authorization", `Bearer ${companySession.body.token}`);
    expect(companyRequests.status).toBe(200);

    const staffDeniedCompany = await request(app)
      .get("/api/admin/company/requests")
      .set("Authorization", `Bearer ${staffSession.body.token}`);
    expect(staffDeniedCompany.status).toBe(403);
  });
});
