/**
 * Apply pending SQL files in database/migrations to TiDB.
 * Tracks filenames in schema_migrations. Safe to re-run.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const database = requireEnv("DB_NAME");
  const bootstrap = await mysql.createConnection({
    host: requireEnv("DB_HOST"),
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    connectTimeout: 20_000,
  });
  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\``);
  await bootstrap.end();

  const conn = await mysql.createConnection({
    host: requireEnv("DB_HOST"),
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database,
    ssl: process.env.DB_SSL === "false" ? undefined : { minVersion: "TLSv1.2" },
    multipleStatements: true,
    connectTimeout: 20_000,
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const dir = path.join(root, "database", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(rows.map((row) => String(row.filename)));

    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`skip ${filename}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, filename), "utf8");
      console.log(`apply ${filename}`);
      await conn.query(sql);
      await conn.execute(
        "INSERT INTO schema_migrations (filename) VALUES (?)",
        [filename],
      );
      console.log(`ok ${filename}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
