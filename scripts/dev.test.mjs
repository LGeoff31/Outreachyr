import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveSupabaseRuntimeEnv,
  googleOAuthRedirectUri,
  parseEnvOutput,
  serviceArgsForMode,
} from "./dev.mjs";

test("parseEnvOutput reads quoted Supabase status output", () => {
  const parsed = parseEnvOutput(`
API_URL="http://127.0.0.1:65432"
DB_URL='postgresql://postgres@127.0.0.1:65433/postgres'
ANON_KEY=anon-key
`);

  assert.deepEqual(parsed, {
    ANON_KEY: "anon-key",
    API_URL: "http://127.0.0.1:65432",
    DB_URL: "postgresql://postgres@127.0.0.1:65433/postgres",
  });
});

test("deriveSupabaseRuntimeEnv preserves ports and swaps only the internal host", () => {
  const env = deriveSupabaseRuntimeEnv(
    {
      ANON_KEY: "anon-key",
      API_URL: "http://127.0.0.1:65432",
      DB_URL: "postgresql://postgres@127.0.0.1:65433/postgres",
      PUBLISHABLE_KEY: "publishable-key",
      STUDIO_URL: "http://127.0.0.1:65434",
    },
    { internalHost: "docker.host" }
  );

  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:65432");
  assert.equal(env.SUPABASE_URL, "http://docker.host:65432");
  assert.equal(env.SUPABASE_SERVER_URL, "http://docker.host:65432");
  assert.equal(
    env.DATABASE_URL,
    "postgresql+psycopg://postgres@docker.host:65433/postgres"
  );
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, "publishable-key");
  assert.equal(env.SUPABASE_STUDIO_URL, "http://127.0.0.1:65434");
});

test("deriveSupabaseRuntimeEnv falls back to the anon key for older CLI output", () => {
  const env = deriveSupabaseRuntimeEnv(
    {
      ANON_KEY: "anon-key",
      API_URL: "http://127.0.0.1:65432",
      DB_URL: "postgresql://postgres@127.0.0.1:65433/postgres",
    },
    { internalHost: "docker.host" }
  );

  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, "anon-key");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "anon-key");
});

test("googleOAuthRedirectUri derives the provider callback from the Supabase API URL", () => {
  assert.equal(
    googleOAuthRedirectUri("http://127.0.0.1:54321/"),
    "http://127.0.0.1:54321/auth/v1/callback"
  );
});

test("serviceArgsForMode scopes compose services without changing the default", () => {
  assert.deepEqual(serviceArgsForMode("dev"), []);
  assert.deepEqual(serviceArgsForMode("backend"), ["backend"]);
  assert.deepEqual(serviceArgsForMode("frontend"), ["frontend"]);
});
