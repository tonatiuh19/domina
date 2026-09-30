/**
 * HTTP helpers for Domina API integration tests (supertest + createServer).
 */
import request from "supertest";
import type { Express } from "express";

export async function requestUserOtp(
  app: Express,
  email: string,
  profile?: { firstName?: string; lastName?: string; audience?: string },
) {
  return request(app)
    .post("/api/auth/user/request-otp")
    .send({
      email,
      firstName: profile?.firstName ?? "Ada",
      lastName: profile?.lastName ?? "Prueba",
      audience: profile?.audience ?? "professional",
    });
}

export async function loginUser(
  app: Express,
  email: string,
  profile?: { firstName?: string; lastName?: string; audience?: string },
): Promise<string> {
  const requested = await requestUserOtp(app, email, profile);
  if (requested.status !== 200 || !requested.body.devCode) {
    throw new Error(`user OTP failed: ${requested.status} ${JSON.stringify(requested.body)}`);
  }
  const verified = await request(app).post("/api/auth/user/verify-otp").send({
    email,
    code: requested.body.devCode,
  });
  if (verified.status !== 200 || !verified.body.token) {
    throw new Error(`user verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }
  return verified.body.token as string;
}

export async function loginStaff(app: Express, email: string): Promise<string> {
  const requested = await request(app).post("/api/auth/admin/request-otp").send({ email });
  if (requested.status !== 200 || !requested.body.devCode) {
    throw new Error(`staff OTP failed: ${requested.status} ${JSON.stringify(requested.body)}`);
  }
  const verified = await request(app).post("/api/auth/admin/verify-otp").send({
    email,
    code: requested.body.devCode,
  });
  if (verified.status !== 200 || !verified.body.token) {
    throw new Error(`staff verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }
  return verified.body.token as string;
}

export async function loginCompany(
  app: Express,
  email: string,
  companyName = "Taller Norte",
): Promise<{ token: string; admin: { id: number; role: string; companyId: number } }> {
  const requested = await request(app).post("/api/auth/admin/request-otp").send({
    email,
    companyName,
    contactName: "Contacto",
  });
  if (requested.status !== 200 || !requested.body.devCode) {
    throw new Error(`company OTP failed: ${requested.status} ${JSON.stringify(requested.body)}`);
  }
  const verified = await request(app).post("/api/auth/admin/verify-otp").send({
    email,
    code: requested.body.devCode,
  });
  if (verified.status !== 200 || !verified.body.token) {
    throw new Error(`company verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }
  return {
    token: verified.body.token as string,
    admin: verified.body.admin,
  };
}

export async function openPowerBiEdition(app: Express): Promise<{
  courseId: number;
  editionId: number;
  capacity: number;
}> {
  const catalog = await request(app).get("/api/catalog/courses");
  if (catalog.status !== 200) throw new Error("catalog failed");
  const powerBi = (catalog.body.courses || []).find(
    (course: { slug: string }) => course.slug === "power-bi-practico",
  );
  if (!powerBi?.editions?.length) throw new Error("power-bi-practico edition missing from seed");
  const edition = powerBi.editions[0];
  return {
    courseId: Number(powerBi.id),
    editionId: Number(edition.id),
    capacity: Number(edition.capacity),
  };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
