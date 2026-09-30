import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "mysql2/promise";
import { createServer } from "./index";
import {
  cleanupIntegrationTestFixtures,
  createIntegrationTestPool,
  insertStaff,
  lookupCatalogIds,
  requireIntegrationDb,
} from "./testDbCleanup";
import { auth, loginStaff } from "./testHarness";

const runId = `vitest-cat-${Date.now()}`;

describe("admin catalog options", () => {
  const app = createServer();
  let pool: Pool;
  let token: string;
  let cityId: number;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    token = await loginStaff(app, `${runId}-coord@example.test`);
    cityId = (await lookupCatalogIds(pool)).cityId;
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId });
    await pool.end();
  });

  it("lists all catalog kinds", async () => {
    for (const kind of ["categories", "levels", "audiences", "cities", "venues"]) {
      const res = await request(app).get(`/api/admin/catalog/${kind}`).set(auth(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.options)).toBe(true);
      expect(res.body.options.length).toBeGreaterThan(0);
    }
  });

  it("creates and deactivates a category", async () => {
    const slug = `${runId}-cat`;
    const created = await request(app)
      .post("/api/admin/catalog/categories")
      .set(auth(token))
      .send({ label: `${runId} Category`, slug });
    expect(created.status).toBe(201);
    const id = created.body.option.id as number;

    const dup = await request(app)
      .post("/api/admin/catalog/categories")
      .set(auth(token))
      .send({ label: "Dup", slug });
    expect(dup.status).toBe(409);

    const patched = await request(app)
      .patch(`/api/admin/catalog/categories/${id}`)
      .set(auth(token))
      .send({ isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.option.isActive).toBe(false);
  });

  it("requires cityId for venues", async () => {
    const bad = await request(app)
      .post("/api/admin/catalog/venues")
      .set(auth(token))
      .send({ label: `${runId} Venue`, slug: `${runId}-venue-bad` });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post("/api/admin/catalog/venues")
      .set(auth(token))
      .send({
        label: `${runId} Venue`,
        slug: `${runId}-venue`,
        cityId,
        address: "Calle Test 1",
      });
    expect(ok.status).toBe(201);
    expect(ok.body.option.cityId).toBe(cityId);

    const deactivated = await request(app)
      .patch(`/api/admin/catalog/venues/${ok.body.option.id}`)
      .set(auth(token))
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
  });

  it("rejects unknown kind", async () => {
    const res = await request(app).get("/api/admin/catalog/widgets").set(auth(token));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
