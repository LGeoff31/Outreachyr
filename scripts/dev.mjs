import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const DEFAULT_INTERNAL_HOST = "host.docker.internal";
const DEFAULT_PUBLIC_HOST = "localhost";
const SENSITIVE_STATUS_KEYS = [
  "ANON_KEY",
  "JWT_SECRET",
  "PUBLISHABLE_KEY",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "SECRET_KEY",
  "SERVICE_ROLE_KEY",
];

export function parseEnvOutput(output) {
  const env = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
}

function loadDotenv(dotenvPath = path.join(REPO_ROOT, ".env")) {
  if (!existsSync(dotenvPath)) return {};
  return parseEnvOutput(readFileSync(dotenvPath, "utf8"));
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function statusKey(env, name) {
  return env[name]?.trim() || "";
}

function urlWithHostname(rawUrl, hostname) {
  const url = new URL(rawUrl);
  url.hostname = hostname;
  const rendered = url.toString();
  return rawUrl.endsWith("/") ? rendered : rendered.replace(/\/$/, "");
}

function databaseUrlForPsycopg(rawUrl, hostname) {
  const url = new URL(rawUrl);
  url.hostname = hostname;

  if (url.protocol === "postgres:" || url.protocol === "postgresql:") {
    url.protocol = "postgresql+psycopg:";
  }

  return url.toString();
}

function redactDatabasePassword(rawUrl) {
  const url = new URL(rawUrl);
  if (url.password) url.password = "redacted";
  return url.toString();
}

function redactSupabaseOutput(output) {
  let redacted = output;
  for (const key of SENSITIVE_STATUS_KEYS) {
    redacted = redacted.replace(
      new RegExp(`("${key}"\\s*:\\s*")[^"]+(")`, "g"),
      `$1[redacted]$2`
    );
    redacted = redacted.replace(
      new RegExp(`(^|\\n)(?:export\\s+)?${key}=([^\\n]+)`, "g"),
      `$1${key}=[redacted]`
    );
  }
  return redacted;
}

function appSiteUrl(env) {
  if (env.SUPABASE_AUTH_SITE_URL?.trim()) return env.SUPABASE_AUTH_SITE_URL.trim();
  if (env.PUBLIC_APP_URL?.trim()) return env.PUBLIC_APP_URL.trim().replace(/\/+$/, "");
  if (env.FRONTEND_URL?.trim()) return env.FRONTEND_URL.trim().replace(/\/+$/, "");

  const frontendPort = requiredEnv(env, "FRONTEND_PORT");
  const publicHost = env.APP_LOCAL_HOST?.trim() || DEFAULT_PUBLIC_HOST;
  return `http://${publicHost}:${frontendPort}`;
}

function callbackUrl(siteUrl) {
  return new URL("/auth/callback", `${siteUrl.replace(/\/+$/, "")}/`).toString();
}

export function googleOAuthRedirectUri(apiUrl) {
  return `${apiUrl.replace(/\/+$/, "")}/auth/v1/callback`;
}

export function deriveSupabaseRuntimeEnv(statusEnv, options = {}) {
  const publicApiUrl = requiredEnv(statusEnv, "API_URL");
  const dbUrl = requiredEnv(statusEnv, "DB_URL");
  const publishableKey =
    statusKey(statusEnv, "PUBLISHABLE_KEY") || requiredEnv(statusEnv, "ANON_KEY");
  const internalHost = options.internalHost || DEFAULT_INTERNAL_HOST;
  const internalApiUrl = urlWithHostname(publicApiUrl, internalHost);
  const internalDbUrl = databaseUrlForPsycopg(dbUrl, internalHost);

  return {
    DATABASE_URL: internalDbUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: publicApiUrl,
    SUPABASE_PUBLIC_URL: publicApiUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVER_URL: internalApiUrl,
    SUPABASE_STUDIO_URL: statusEnv.STUDIO_URL || "",
    SUPABASE_URL: internalApiUrl,
  };
}

export function serviceArgsForMode(mode) {
  if (mode === "backend") return ["backend"];
  if (mode === "frontend") return ["frontend"];
  return [];
}

function composeUpArgsForMode(mode) {
  const args = ["compose", "up", "--build", "--watch"];
  if (mode === "frontend") args.push("--no-deps");
  args.push(...serviceArgsForMode(mode));
  return args;
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: options.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture && result.stdout) {
      process.stdout.write(
        options.redact ? redactSupabaseOutput(result.stdout) : result.stdout
      );
    }
    if (options.capture && result.stderr) {
      process.stderr.write(
        options.redact ? redactSupabaseOutput(result.stderr) : result.stderr
      );
    }
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }

  return result.stdout ?? "";
}

function spawnInherited(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function runtimeEnv() {
  const env = { ...loadDotenv(), ...process.env };
  const siteUrl = appSiteUrl(env);

  return {
    ...env,
    SUPABASE_AUTH_CALLBACK_URL:
      env.SUPABASE_AUTH_CALLBACK_URL?.trim() || callbackUrl(siteUrl),
    SUPABASE_AUTH_SITE_URL: siteUrl,
  };
}

function printDerivedUrls(env) {
  console.log(`Supabase API URL for browser: ${env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(
    `Google OAuth redirect URI: ${googleOAuthRedirectUri(env.NEXT_PUBLIC_SUPABASE_URL)}`
  );
  console.log(`Supabase API URL for containers: ${env.SUPABASE_URL}`);
  console.log(
    `Supabase DB URL for containers: ${redactDatabasePassword(env.DATABASE_URL)}`
  );
  if (env.SUPABASE_STUDIO_URL) {
    console.log(`Supabase Studio URL: ${env.SUPABASE_STUDIO_URL}`);
  }
}

async function up(mode) {
  const env = runtimeEnv();

  console.log("Starting local Supabase...");
  runSync("npm", ["exec", "--", "supabase", "start"], {
    capture: true,
    env,
    redact: true,
  });
  console.log("Local Supabase is running.");
  const statusOutput = runSync(
    "npm",
    ["exec", "--", "supabase", "status", "-o", "env"],
    { capture: true, env }
  );
  const statusEnv = parseEnvOutput(statusOutput);
  const supabaseEnv = deriveSupabaseRuntimeEnv(statusEnv, {
    internalHost: env.SUPABASE_INTERNAL_HOST || DEFAULT_INTERNAL_HOST,
  });
  const composeEnv = { ...env, ...supabaseEnv };

  printDerivedUrls(supabaseEnv);

  const exitCode = await spawnInherited("docker", composeUpArgsForMode(mode), composeEnv);
  process.exit(exitCode);
}

async function down() {
  const env = runtimeEnv();
  const composeCode = await spawnInherited("docker", ["compose", "down"], env);
  if (composeCode !== 0) process.exit(composeCode);
  runSync("npm", ["exec", "--", "supabase", "stop"], { env });
}

async function main() {
  const mode = process.argv[2] || "dev";
  if (!["dev", "backend", "frontend", "down"].includes(mode)) {
    throw new Error(`Unknown dev mode: ${mode}`);
  }

  if (mode === "down") {
    await down();
    return;
  }

  await up(mode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
