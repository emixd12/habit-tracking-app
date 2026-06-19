import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.local";
const PASSWORD_PREFIX = "CadenceRlsSmoke";
const DEFAULT_CATEGORY_NAME = "Other";

export function readSmokeConfig(env = process.env, envFilePath = ENV_FILE) {
  const fileEnv = readEnvFile(envFilePath);
  const mergedEnv = { ...fileEnv, ...env };
  const url = normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = normalizeEnvValue(mergedEnv.SUPABASE_SERVICE_ROLE_KEY);
  const missing = [];

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Supabase RLS smoke config: ${missing.join(", ")}.`);
  }

  return {
    url,
    publishableKey,
    serviceRoleKey,
  };
}

export function buildSmokeUserEmail(runId, slot) {
  return `cadence-rls-smoke-${runId}-${slot}@example.invalid`;
}

export function buildSmokePassword(runId) {
  return `${PASSWORD_PREFIX}-${runId}-aA1!`;
}

export function summarizeSmokeResult(result) {
  return [
    `RLS smoke passed for run ${result.runId}.`,
    `Created ${result.createdUsers} temporary users.`,
    `Verified ${result.checkedAssertions} ownership checks.`,
    "Cleaned up temporary users.",
  ].join(" ");
}

async function main() {
  const config = readSmokeConfig();
  const runId = randomUUID().slice(0, 8);
  const password = buildSmokePassword(runId);
  const admin = createSupabase(config.url, config.serviceRoleKey);
  const users = [];

  try {
    users.push(
      await createTemporaryUser(admin, buildSmokeUserEmail(runId, "a"), password),
      await createTemporaryUser(admin, buildSmokeUserEmail(runId, "b"), password),
    );

    const userA = users[0];
    const userB = users[1];
    const clientA = await signInTemporaryUser(config, userA.email, password);
    const clientB = await signInTemporaryUser(config, userB.email, password);
    const assertions = [];

    await waitForOnboardingRows(clientA, userA.id);
    await waitForOnboardingRows(clientB, userB.id);

    const categoryA = await getCategory(clientA, userA.id);
    const categoryB = await getCategory(clientB, userB.id);
    const behaviorA = await createSmokeBehavior(clientA, {
      userId: userA.id,
      categoryId: categoryA.id,
      title: `RLS smoke A ${runId}`,
    });
    const behaviorB = await createSmokeBehavior(clientB, {
      userId: userB.id,
      categoryId: categoryB.id,
      title: `RLS smoke B ${runId}`,
    });

    assertions.push(await assertProfileIsolation(clientA, userB.id));
    assertions.push(await assertCategoryIsolation(clientA, userB.id));
    assertions.push(await assertBehaviorIsolation(clientA, behaviorB.id));
    assertions.push(await assertBehaviorInsertCheck(clientA, userB.id));
    assertions.push(await assertBehaviorUpdateIsolation(clientA, behaviorB.id));
    assertions.push(await assertOwnBehaviorVisible(clientA, behaviorA.id));

    console.log(
      summarizeSmokeResult({
        runId,
        createdUsers: users.length,
        checkedAssertions: assertions.length,
      }),
    );
  } finally {
    await Promise.allSettled(
      users.map((user) => admin.auth.admin.deleteUser(user.id)),
    );
  }
}

async function createTemporaryUser(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: "Cadence RLS Smoke",
    },
  });

  if (error || !data.user) {
    throw new Error(`Unable to create temporary smoke user: ${error?.message}`);
  }

  return {
    id: data.user.id,
    email,
  };
}

async function signInTemporaryUser(config, email, password) {
  const client = createSupabase(config.url, config.publishableKey);
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Unable to sign in temporary smoke user: ${error.message}`);
  }

  return client;
}

async function waitForOnboardingRows(client, userId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: profile } = await client
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    const { data: categories } = await client
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (profile && categories && categories.length > 0) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for profile/default categories.");
}

async function getCategory(client, userId) {
  const { data, error } = await client
    .from("categories")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", DEFAULT_CATEGORY_NAME)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Unable to read smoke category: ${error?.message}`);
  }

  return data;
}

async function createSmokeBehavior(client, input) {
  const { data, error } = await client
    .from("behaviors")
    .insert({
      user_id: input.userId,
      category_id: input.categoryId,
      title: input.title,
      description: null,
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      scheduled_time: "09:00",
      timezone: "America/New_York",
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      archived_at: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Unable to create smoke behavior: ${error?.message}`);
  }

  return data;
}

async function assertProfileIsolation(client, otherUserId) {
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("id", otherUserId);

  assertNoError(error, "reading another user's profile");
  assertNoRows(data, "another user's profile");

  return "profile_select";
}

async function assertCategoryIsolation(client, otherUserId) {
  const { data, error } = await client
    .from("categories")
    .select("id")
    .eq("user_id", otherUserId);

  assertNoError(error, "reading another user's categories");
  assertNoRows(data, "another user's categories");

  return "category_select";
}

async function assertBehaviorIsolation(client, otherBehaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .select("id")
    .eq("id", otherBehaviorId);

  assertNoError(error, "reading another user's behavior");
  assertNoRows(data, "another user's behavior");

  return "behavior_select";
}

async function assertBehaviorInsertCheck(client, otherUserId) {
  const { data, error } = await client
    .from("behaviors")
    .insert({
      user_id: otherUserId,
      category_id: null,
      title: "RLS smoke forbidden insert",
      description: null,
      recurrence_rule: {
        frequency: "daily",
        interval: 1,
      },
      scheduled_time: "10:00",
      timezone: "America/New_York",
      browser_reminder_enabled: true,
      email_reminder_enabled: false,
      reminder_offset_minutes: 0,
      active: true,
      archived_at: null,
    })
    .select("id");

  if (!error) {
    throw new Error(
      `RLS allowed inserting a behavior for another user: ${JSON.stringify(data)}`,
    );
  }

  return "behavior_insert_check";
}

async function assertBehaviorUpdateIsolation(client, otherBehaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .update({ title: "RLS smoke forbidden update" })
    .eq("id", otherBehaviorId)
    .select("id");

  assertNoError(error, "updating another user's behavior");
  assertNoRows(data, "updated behavior rows");

  return "behavior_update";
}

async function assertOwnBehaviorVisible(client, behaviorId) {
  const { data, error } = await client
    .from("behaviors")
    .select("id")
    .eq("id", behaviorId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`RLS hid the signed-in user's own behavior: ${error?.message}`);
  }

  return "own_behavior_select";
}

function createSupabase(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertNoError(error, action) {
  if (error) {
    throw new Error(`Unexpected error while ${action}: ${error.message}`);
  }
}

function assertNoRows(data, label) {
  if (data && data.length > 0) {
    throw new Error(`RLS exposed ${label}.`);
  }
}

function normalizeEnvValue(value) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return env;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(
      `${basename(process.argv[1])} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
