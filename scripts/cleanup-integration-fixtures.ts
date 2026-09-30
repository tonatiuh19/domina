/**
 * Purge leftover integration-test fixtures from the shared TiDB database.
 *
 *   npx tsx scripts/cleanup-integration-fixtures.ts
 *   npx tsx scripts/cleanup-integration-fixtures.ts --dry-run
 *
 * Deletes users, admins, and companies whose email ends with @example.test.
 * Enrollments, sessions, codes, and payments cascade through foreign keys.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const TEST_DOMAIN = "%@example.test";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DB_HOST) {
    console.error("DB_HOST required (.env)");
    process.exit(1);
  }
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    connectionLimit: 2,
  });

  const targets: Array<[string, string]> = [
    ["users", "DELETE FROM users WHERE email LIKE ?"],
    ["admins", "DELETE FROM admins WHERE email LIKE ?"],
    ["companies", "DELETE FROM companies WHERE email LIKE ?"],
    [
      "login codes",
      `DELETE FROM user_login_codes WHERE email LIKE ?;
       DELETE FROM admin_login_codes WHERE email LIKE ?`,
    ],
  ];

  try {
    for (const [label, sql] of targets) {
      if (label === "login codes") {
        if (dryRun) {
          console.log(`would purge ${label}`);
          continue;
        }
        await pool.query("DELETE FROM user_login_codes WHERE email LIKE ?", [TEST_DOMAIN]);
        await pool.query("DELETE FROM admin_login_codes WHERE email LIKE ?", [TEST_DOMAIN]);
        console.log(`purged ${label}`);
        continue;
      }
      if (dryRun) {
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
          sql.replace("DELETE FROM", "SELECT COUNT(*) AS c FROM"),
          [TEST_DOMAIN],
        );
        console.log(`${label}: ${rows[0]?.c ?? 0}`);
        continue;
      }
      const [result] = await pool.query<mysql.ResultSetHeader>(sql, [TEST_DOMAIN]);
      console.log(`purged ${label}: ${result.affectedRows}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
