/**
 * Shared TiDB helpers for API integration tests.
 * Always pass `{ runId }` so fixtures are scoped and cleaned up.
 */
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export const INTEGRATION_TEST_EMAIL_SUFFIX = "@example.test";

export function isIntegrationTestEmail(email: string | null | undefined): boolean {
  return String(email || "")
    .trim()
    .toLowerCase()
    .endsWith(INTEGRATION_TEST_EMAIL_SUFFIX);
}

export function requireIntegrationDb(): void {
  if (!process.env.DB_HOST?.trim()) {
    throw new Error("DB_HOST required for integration tests (load .env)");
  }
}

export function createIntegrationTestPool(): Pool {
  requireIntegrationDb();
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 60_000,
  });
}

function isRetriableDbError(err: unknown): boolean {
  const code = String((err as NodeJS.ErrnoException)?.code || "");
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNREFUSED"
  );
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 4;
  const baseDelayMs = opts?.baseDelayMs ?? 1500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetriableDbError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export type CleanupOptions = {
  runId: string;
  /** Extra course slugs created by the suite (in addition to runId %). */
  courseSlugs?: string[];
};

/**
 * Delete users/admins/companies matching the suite runId prefix,
 * plus any courses/editions tagged with that runId in the slug.
 */
export async function cleanupIntegrationTestFixtures(
  pool: Pool,
  options: CleanupOptions,
): Promise<void> {
  const runId = String(options.runId || "").trim();
  if (!runId) throw new Error("cleanupIntegrationTestFixtures requires { runId }");
  const emailLike = `${runId}%${INTEGRATION_TEST_EMAIL_SUFFIX}`;
  const slugLike = `${runId}%`;

  await withDbRetry(async () => {
    await pool.query("DELETE FROM user_login_codes WHERE email LIKE ?", [emailLike]);
    await pool.query("DELETE FROM admin_login_codes WHERE email LIKE ?", [emailLike]);
    await pool.query("DELETE FROM users WHERE email LIKE ?", [emailLike]);
    await pool.query("DELETE FROM admins WHERE email LIKE ?", [emailLike]);
    await pool.query("DELETE FROM companies WHERE email LIKE ?", [emailLike]);

    const slugs = [slugLike, ...(options.courseSlugs || [])];
    for (const slug of slugs) {
      await pool.query("DELETE FROM courses WHERE slug LIKE ?", [slug.includes("%") ? slug : slug]);
    }
    // Soft-deactivated catalog rows created in tests
    await pool.query(
      "DELETE FROM course_venues WHERE slug LIKE ? AND is_active = 0",
      [slugLike],
    );
    for (const table of ["course_categories", "course_levels", "course_audiences", "course_cities"] as const) {
      await pool.query(`DELETE FROM ${table} WHERE slug LIKE ? AND is_active = 0`, [slugLike]);
    }
  });
}

export async function insertStaff(
  pool: Pool,
  input: {
    email: string;
    role: "owner" | "coordinator" | "instructor" | "finance" | "company";
    firstName?: string;
    status?: "active" | "invited" | "disabled";
    companyId?: number | null;
  },
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO admins (email, first_name, last_name, role, status, company_id) VALUES (?, ?, '', ?, ?, ?)",
    [
      input.email,
      input.firstName || "Test",
      input.role,
      input.status || "active",
      input.companyId ?? null,
    ],
  );
  return result.insertId;
}

export async function lookupCatalogIds(pool: Pool): Promise<{
  categoryId: number;
  audienceId: number;
  levelId: number;
  cityId: number;
  venueId: number;
}> {
  const [[cat]] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM course_categories WHERE slug = 'tech' AND is_active = 1 LIMIT 1",
  );
  const [[aud]] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM course_audiences WHERE slug = 'open' AND is_active = 1 LIMIT 1",
  );
  const [[lvl]] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM course_levels WHERE slug = 'intro' AND is_active = 1 LIMIT 1",
  );
  const [[city]] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM course_cities WHERE slug = 'guadalajara' AND is_active = 1 LIMIT 1",
  );
  const [[venue]] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM course_venues WHERE city_id = ? AND is_active = 1 ORDER BY sort_order LIMIT 1",
    [city.id],
  );
  if (!cat?.id || !aud?.id || !lvl?.id || !city?.id || !venue?.id) {
    throw new Error("Seed catalog options missing — run migrations / schema seed");
  }
  return {
    categoryId: Number(cat.id),
    audienceId: Number(aud.id),
    levelId: Number(lvl.id),
    cityId: Number(city.id),
    venueId: Number(venue.id),
  };
}
