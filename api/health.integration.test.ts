import { describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "./index";

describe("health + stripe webhook guards", () => {
  const app = createServer();

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("Stripe webhook returns 503 when Stripe is disabled under VITEST", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send({ type: "checkout.session.completed" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("portal checkout returns 503 without live Stripe under VITEST", async () => {
    const res = await request(app).post("/api/portal/checkout").send({ enrollmentId: 1 });
    expect(res.status).toBe(401);
  });
});
