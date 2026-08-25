import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { readLocalSmokeConfig } from "./supabase-rls-smoke.mjs";

const PASSWORD_PREFIX = "CadencePushCapSmoke";

async function main() {
  const config = readLocalSmokeConfig();
  const runId = randomUUID().slice(0, 8);
  const email = `cadence-push-cap-${runId}@example.invalid`;
  const password = `${PASSWORD_PREFIX}-${runId}-aA1!`;
  const admin = createSupabase(config.url, config.serviceRoleKey);
  let userId = null;
  let secondUserId = null;

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !created.user) {
      throw createError ?? new Error("Local push-cap user was not created.");
    }

    userId = created.user.id;
    const client = createSupabase(config.url, config.publishableKey);
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      throw signInError;
    }

    for (let index = 1; index <= 21; index += 1) {
      await registerSubscription(client, {
        userId,
        endpoint: endpointFor(runId, "ordered", index),
        timestamp: new Date(Date.UTC(2026, 7, 25, 12, 0, index)).toISOString(),
      });
    }

    const orderedRows = await listSubscriptions(client, userId);
    const orderedActive = orderedRows.filter((row) => row.active);

    assert(orderedActive.length === 20, "The 21st registration did not retain a 20-row cap.");
    assert(
      orderedRows.find((row) => row.endpoint === endpointFor(runId, "ordered", 1))
        ?.active === false,
      "The 21st registration did not evict the LRU row.",
    );
    assert(
      orderedRows.find((row) => row.endpoint === endpointFor(runId, "ordered", 21))
        ?.active === true,
      "The newly registered 21st endpoint was not retained.",
    );

    await registerSubscription(client, {
      userId,
      endpoint: endpointFor(runId, "ordered", 21),
      timestamp: "2026-08-25T12:02:00.000Z",
    });
    const refreshedRows = await listSubscriptions(client, userId);
    assert(
      refreshedRows.filter((row) => row.active).length === 20,
      "Re-registering one active endpoint incorrectly reduced the active set.",
    );
    assert(
      refreshedRows.find(
        (row) => row.endpoint === endpointFor(runId, "ordered", 2),
      )?.active === true,
      "Re-registering an active endpoint incorrectly evicted another device.",
    );

    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        registerSubscription(client, {
          userId,
          endpoint: endpointFor(runId, "concurrent", index + 1),
          timestamp: new Date(
            Date.UTC(2026, 7, 25, 13, 0, index + 1),
          ).toISOString(),
        }),
      ),
    );

    const concurrentRows = await listSubscriptions(client, userId);
    assert(
      concurrentRows.filter((row) => row.active).length === 20,
      "Concurrent successful registrations left more than 20 active rows.",
    );

    const sharedEndpoint = endpointFor(runId, "account-switch", 1);
    await registerSubscription(client, {
      userId,
      endpoint: sharedEndpoint,
      timestamp: "2026-08-25T14:00:00.000Z",
    });
    const { error: deactivateError } = await client
      .from("push_subscriptions")
      .update({ active: false })
      .eq("endpoint", sharedEndpoint)
      .eq("active", true);

    if (deactivateError) {
      throw deactivateError;
    }

    const secondEmail = `cadence-push-cap-${runId}-second@example.invalid`;
    const { data: secondCreated, error: secondCreateError } =
      await admin.auth.admin.createUser({
        email: secondEmail,
        password,
        email_confirm: true,
      });

    if (secondCreateError || !secondCreated.user) {
      throw secondCreateError ?? new Error("Second local push-cap user was not created.");
    }

    secondUserId = secondCreated.user.id;
    const secondClient = createSupabase(config.url, config.publishableKey);
    const { error: secondSignInError } =
      await secondClient.auth.signInWithPassword({
        email: secondEmail,
        password,
      });

    if (secondSignInError) {
      throw secondSignInError;
    }

    await registerSubscription(secondClient, {
      userId: secondUserId,
      endpoint: sharedEndpoint,
      timestamp: "2026-08-25T14:01:00.000Z",
    });
    const secondRows = await listSubscriptions(secondClient, secondUserId);
    assert(
      secondRows.some((row) => row.endpoint === sharedEndpoint && row.active),
      "The second account could not activate the departed account's endpoint.",
    );

    console.log(
      "Push subscription cap smoke passed: LRU eviction, concurrent cap enforcement, and authenticated second-account endpoint reuse.",
    );
  } finally {
    if (secondUserId) {
      const { error } = await admin.auth.admin.deleteUser(secondUserId);

      if (error) {
        throw new Error("Push-cap smoke cleanup could not delete its exact second user.");
      }
    }

    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);

      if (error) {
        throw new Error("Push-cap smoke cleanup could not delete its exact user.");
      }
    }
  }
}

async function registerSubscription(client, input) {
  const { error } = await client.from("push_subscriptions").upsert(
    {
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: `p256dh-${input.endpoint}`,
      auth: `auth-${input.endpoint}`,
      user_agent: "Ticket 082 local smoke",
      active: true,
      created_at: input.timestamp,
      updated_at: input.timestamp,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) {
    throw error;
  }
}

async function listSubscriptions(client, userId) {
  const { data, error } = await client
    .from("push_subscriptions")
    .select("endpoint,active")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

function endpointFor(runId, group, index) {
  return `https://push.example.invalid/${runId}/${group}/${index}`;
}

function createSupabase(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

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
