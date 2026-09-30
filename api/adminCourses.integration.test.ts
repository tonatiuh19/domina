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

const runId = `vitest-course-${Date.now()}`;
const slug = `${runId}-course`;

describe("admin courses + editions + gallery", () => {
  const app = createServer();
  let pool: Pool;
  let token: string;
  let ids: Awaited<ReturnType<typeof lookupCatalogIds>>;
  let courseId: number;
  let editionId: number;

  beforeAll(async () => {
    requireIntegrationDb();
    pool = createIntegrationTestPool();
    await insertStaff(pool, { email: `${runId}-coord@example.test`, role: "coordinator" });
    token = await loginStaff(app, `${runId}-coord@example.test`);
    ids = await lookupCatalogIds(pool);
  });

  afterAll(async () => {
    await cleanupIntegrationTestFixtures(pool, { runId, courseSlugs: [slug, `${slug}-2`] });
    await pool.end();
  });

  it("checks slug availability and creates a course", async () => {
    const available = await request(app)
      .get("/api/admin/courses/slug-availability")
      .query({ slug })
      .set(auth(token));
    expect(available.status).toBe(200);
    expect(available.body.available).toBe(true);

    const created = await request(app)
      .post("/api/admin/courses")
      .set(auth(token))
      .send({
        title: `${runId} Course`,
        slug,
        categoryId: ids.categoryId,
        audienceId: ids.audienceId,
        levelId: ids.levelId,
        cityId: ids.cityId,
        summary: "A summary long enough for validation.",
        promise: "Learn something real.",
        descriptionHtml: "<p>About the course</p>",
        durationHours: 6,
        capacity: 12,
        priceCents: 99000,
        minEnrollment: 6,
        status: "draft",
      });
    expect(created.status).toBe(201);
    courseId = created.body.id;

    const conflict = await request(app)
      .post("/api/admin/courses")
      .set(auth(token))
      .send({
        title: "Other",
        slug,
        categoryId: ids.categoryId,
        audienceId: ids.audienceId,
        levelId: ids.levelId,
        cityId: ids.cityId,
        summary: "A summary long enough for validation.",
        promise: "Promise text here.",
        durationHours: 4,
        capacity: 10,
        priceCents: 50000,
        minEnrollment: 5,
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.suggested).toBeTruthy();

    const taken = await request(app)
      .get("/api/admin/courses/slug-availability")
      .query({ slug })
      .set(auth(token));
    expect(taken.body.available).toBe(false);
  });

  it("patches course, schedules edition, uploads cover/gallery under VITEST stub", async () => {
    const patched = await request(app)
      .patch(`/api/admin/courses/${courseId}`)
      .set(auth(token))
      .send({ status: "published", promise: "Updated promise text." });
    expect(patched.status).toBe(200);

    const starts = new Date(Date.now() + 14 * 86400000).toISOString();
    const ends = new Date(Date.now() + 14 * 86400000 + 6 * 3600000).toISOString();
    const edition = await request(app)
      .post(`/api/admin/courses/${courseId}/editions`)
      .set(auth(token))
      .send({
        startsAt: starts,
        endsAt: ends,
        venueId: ids.venueId,
        capacity: 12,
        priceCents: 99000,
        minEnrollment: 6,
        status: "presale",
      });
    expect(edition.status).toBe(201);
    editionId = edition.body.id;

    const editionPatch = await request(app)
      .patch(`/api/admin/editions/${editionId}`)
      .set(auth(token))
      .send({ status: "confirmed" });
    expect(editionPatch.status).toBe(200);

    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const cover = await request(app)
      .post(`/api/admin/courses/${courseId}/cover-image`)
      .set(auth(token))
      .send({ dataBase64: pngBase64, filename: "cover.png", mimeType: "image/png" });
    expect(cover.status).toBe(200);
    expect(String(cover.body.url || "")).toMatch(/http/);

    const gallery = await request(app)
      .post(`/api/admin/courses/${courseId}/gallery`)
      .set(auth(token))
      .send({ dataBase64: pngBase64, filename: "shot.png", mimeType: "image/png", caption: "Shot" });
    expect(gallery.status).toBe(200);
    const imageId = gallery.body.image.id as number;

    const caption = await request(app)
      .patch(`/api/admin/courses/${courseId}/gallery/${imageId}`)
      .set(auth(token))
      .send({ caption: "Updated" });
    expect(caption.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/admin/courses/${courseId}/gallery/${imageId}`)
      .set(auth(token));
    expect(removed.status).toBe(200);

    const detail = await request(app)
      .get(`/api/admin/courses/${courseId}`)
      .query({ editionId })
      .set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.course.slug).toBe(slug);

    const publicDetail = await request(app).get(`/api/catalog/courses/${slug}`);
    expect(publicDetail.status).toBe(200);
    expect(publicDetail.body.course.slug).toBe(slug);
  });

  it("lists courses for ops", async () => {
    const list = await request(app).get("/api/admin/courses").set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.courses.some((c: { id: number }) => c.id === courseId)).toBe(true);
  });
});
