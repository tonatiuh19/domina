import "dotenv/config";

import { spawn } from "child_process";
import { createInterface } from "readline/promises";
import mysql from "mysql2/promise";
import { checkApiIndexInline } from "./check-api-inline";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeVersion(value: string): string {
  return value.trim();
}

function dbConfig() {
  return {
    host: requireEnv("DB_HOST"),
    port: Number(requireEnv("DB_PORT")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    ssl:
      process.env.DB_SSL === "false"
        ? undefined
        : { minVersion: "TLSv1.2" as const },
    enableKeepAlive: true,
    connectTimeout: 20_000,
  };
}

async function withDb<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection(dbConfig());
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function runPreDeployChecks() {
  console.log("\nPre-deploy checks: api inline + typecheck + tests...\n");
  const inline = checkApiIndexInline();
  console.log(inline.report);
  if (!inline.ok) {
    throw new Error(
      "api/index.ts has relative runtime imports — inline the logic before deploying to Vercel.",
    );
  }
  await runCommand("npm", ["run", "typecheck"]);
  console.log("\nTypecheck passed.\n");
  await runCommand("npm", ["test"]);
  console.log("\nTests passed.\n");
  console.log("Purging leftover integration-test fixtures...\n");
  await runCommand("npm", ["run", "test:cleanup-fixtures"]);
  console.log("\nFixture cleanup done. Continuing to deploy...\n");
}

async function promptForVersion(currentVersion: string | null): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const currentLabel = currentVersion?.trim() || "not set";
    console.log(`\nCurrent production version: ${currentLabel}`);
    while (true) {
      const input = await rl.question("Enter deploy version: ");
      const version = normalizeVersion(input);
      if (!version) {
        console.log("Version cannot be empty.");
        continue;
      }
      const confirm = await rl.question(
        `Deploy version ${version} to production and update app_version after success? (y/N): `,
      );
      if (confirm.trim().toLowerCase() === "y") return version;
      console.log("Deploy cancelled. Enter a new version or Ctrl+C to abort.");
    }
  } finally {
    rl.close();
  }
}

async function readAppVersion(): Promise<string | null> {
  return withDb(async (conn) => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'app_version' LIMIT 1`,
    );
    return (rows as mysql.RowDataPacket[])[0]?.setting_value ?? null;
  });
}

async function writeAppVersion(deployVersion: string): Promise<void> {
  await withDb(async (conn) => {
    await conn.execute(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
       VALUES ('app_version', ?, 'Current deployed application version shown in the admin settings page.', NOW())
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         description = VALUES(description),
         updated_at = NOW()`,
      [deployVersion],
    );
  });
}

async function main() {
  dbConfig();
  const cliArgs = process.argv.slice(2);
  const skipChecks =
    cliArgs.includes("--skip-checks") ||
    process.env.SKIP_DEPLOY_CHECKS === "1" ||
    process.env.SKIP_DEPLOY_CHECKS === "true";
  const filteredArgs = cliArgs.filter((arg) => arg !== "--skip-checks");
  const explicitVersion = filteredArgs.find((arg) => !arg.startsWith("-")) ?? "";
  const vercelArgs = explicitVersion
    ? filteredArgs.filter((arg, index) => index !== filteredArgs.indexOf(explicitVersion))
    : filteredArgs;

  if (!skipChecks) {
    await runPreDeployChecks();
  } else {
    console.log("\nSkipping pre-deploy checks (--skip-checks / SKIP_DEPLOY_CHECKS).\n");
  }

  const currentVersion = await readAppVersion();
  const deployVersion = explicitVersion
    ? normalizeVersion(explicitVersion)
    : await promptForVersion(currentVersion);
  if (!deployVersion) throw new Error("Deploy version cannot be empty.");

  console.log(`\nStarting Vercel production deploy for version ${deployVersion}...\n`);
  await runCommand("npx", ["vercel", "--prod", ...vercelArgs]);
  await writeAppVersion(deployVersion);
  console.log(`\nDeployed. app_version is now ${deployVersion}.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
