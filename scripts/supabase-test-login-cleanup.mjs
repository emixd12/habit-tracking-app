import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.local";
const DEFAULT_MAX_AGE_HOURS = 24;
const TEST_EMAIL_PREFIX = "cadence-test-";
const TEST_EMAIL_DOMAIN = "@example.invalid";

export function readCleanupConfig(env = process.env, envFilePath = ENV_FILE) {
  const fileEnv = readEnvFile(envFilePath);
  const mergedEnv = { ...fileEnv, ...env };
  const url = normalizeEnvValue(mergedEnv.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(mergedEnv.SUPABASE_SERVICE_ROLE_KEY);
  const maxAgeHours = readMaxAgeHours(mergedEnv.CADENCE_TEST_LOGIN_MAX_AGE_HOURS);
  const missing = [];

  if (!url) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase test login cleanup config: ${missing.join(", ")}.`,
    );
  }

  return {
    maxAgeHours,
    serviceRoleKey,
    url,
  };
}

export function isStaleTestLoginUser(user, cutoffTime) {
  const email = normalizeEnvValue(user.email)?.toLowerCase();
  const createdAt = Date.parse(user.created_at ?? "");

  return (
    Boolean(email?.startsWith(TEST_EMAIL_PREFIX)) &&
    Boolean(email?.endsWith(TEST_EMAIL_DOMAIN)) &&
    Number.isFinite(createdAt) &&
    createdAt < cutoffTime
  );
}

export function summarizeCleanupResult(result) {
  return [
    "Supabase test login cleanup complete.",
    `Checked ${result.checkedUsers} users.`,
    `Deleted ${result.deletedUsers} stale temporary users.`,
  ].join(" ");
}

async function main() {
  const config = readCleanupConfig();
  const admin = createClient(config.url, config.serviceRoleKey);
  const cutoffTime = Date.now() - config.maxAgeHours * 60 * 60 * 1000;
  let checkedUsers = 0;
  let deletedUsers = 0;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(`Unable to list Supabase users: ${error.message}`);
    }

    const users = data.users ?? [];
    checkedUsers += users.length;

    for (const user of users) {
      if (!isStaleTestLoginUser(user, cutoffTime)) {
        continue;
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

      if (deleteError) {
        throw new Error(
          `Unable to delete a stale temporary test user: ${deleteError.message}`,
        );
      }

      deletedUsers += 1;
    }

    if (users.length < 1000) {
      break;
    }
  }

  console.log(summarizeCleanupResult({ checkedUsers, deletedUsers }));
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex === -1) {
          return [line, ""];
        }

        return [
          line.slice(0, separatorIndex),
          line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function normalizeEnvValue(value) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readMaxAgeHours(value) {
  if (!normalizeEnvValue(value)) {
    return DEFAULT_MAX_AGE_HOURS;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error("CADENCE_TEST_LOGIN_MAX_AGE_HOURS must be a positive number.");
  }

  return parsedValue;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`${basename(process.argv[1])}: ${error.message}`);
    process.exitCode = 1;
  });
}
