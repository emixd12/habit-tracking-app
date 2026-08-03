import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import {
  chmod,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FAKE_SEQUENZY_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_FAKE_SEQUENZY_HOST = "127.0.0.1";
export const DEFAULT_FAKE_SEQUENZY_MAX_REQUESTS = 5_000;
export const MAX_FAKE_SEQUENZY_REQUESTS = 10_000;
export const MAX_FAKE_SEQUENZY_BODY_BYTES = 32 * 1024;
export const FAKE_SEQUENZY_SEND_PATH = "/api/v1/transactional/send";
export const FAKE_SEQUENZY_HEALTH_PATH = "/health";

const RUN_ID_PATTERN = /^\d{8}t\d{6}z-[a-f0-9]{12}$/;
const FAKE_API_KEY_PATTERN = /^cadence-load-fake-[A-Za-z0-9_-]{16,}$/;
const FAKE_TEMPLATE_SLUG_PATTERN = /^cadence-load-[a-z0-9-]{3,80}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_MARKER_PATTERN = /cadence-owner-[a-f0-9]{20}/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const REQUIRED_VARIABLES = Object.freeze([
  "BEHAVIOR_DESCRIPTION",
  "BEHAVIOR_ID",
  "BEHAVIOR_TITLE",
  "OCCURRENCE_ID",
  "OCCURRENCE_LOCAL_DATE",
  "OCCURRENCE_SCHEDULED_FOR",
  "REMINDER_SCHEDULED_SEND_AT",
  "SCHEDULED_TIME",
  "TIMELINE_URL",
  "TIMEZONE",
]);
const TOP_LEVEL_FIELDS = Object.freeze([
  "slug",
  "subscriberExternalId",
  "to",
  "variables",
]);

export class FakeSequenzyConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FakeSequenzyConfigurationError";
  }
}

export class FakeSequenzyEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "FakeSequenzyEvidenceError";
  }
}

class FakeSequenzyRequestError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.name = "FakeSequenzyRequestError";
    this.status = status;
    this.reason = reason;
  }
}

export async function startFakeSequenzyServer(options) {
  const config = normalizeServerOptions(options);
  const state = createAggregateState();
  const fingerprints = new Set();
  let closed = false;
  let closePromise;

  const server = createServer(async (request, response) => {
    const pathname = safeRequestPath(request.url);

    if (
      request.method === "GET" &&
      pathname === FAKE_SEQUENZY_HEALTH_PATH
    ) {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        writeJson(response, 403, {
          ok: false,
          error: "Nonlocal fake-provider clients are forbidden.",
        });
        return;
      }
      writeJson(response, 200, {
        ok: true,
        target_classification: "local",
        provider: "fake_sequenzy",
      });
      return;
    }

    state.requestsTotal += 1;
    try {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        throw new FakeSequenzyRequestError(
          403,
          "nonlocal_client",
          "Nonlocal fake-provider clients are forbidden.",
        );
      }
      if (state.requestsTotal > config.maxRequests) {
        throw new FakeSequenzyRequestError(
          429,
          "request_ceiling",
          "The bounded fake-provider request ceiling was reached.",
        );
      }
      if (isWebPushPath(pathname)) {
        state.webPushAttempts += 1;
        throw new FakeSequenzyRequestError(
          404,
          "web_push_forbidden",
          "Web Push is forbidden in the fake email-provider workload.",
        );
      }
      if (
        request.method !== "POST" ||
        pathname !== FAKE_SEQUENZY_SEND_PATH
      ) {
        throw new FakeSequenzyRequestError(
          404,
          "unsupported_route",
          "The fake provider accepts only its transactional send route.",
        );
      }
      if (!authorizationMatches(request.headers.authorization, config.apiKey)) {
        throw new FakeSequenzyRequestError(
          401,
          "unauthorized",
          "The fake provider rejected its generated API key.",
        );
      }
      if (!isJsonContentType(request.headers["content-type"])) {
        throw new FakeSequenzyRequestError(
          415,
          "invalid_content_type",
          "The fake provider accepts JSON only.",
        );
      }

      const payload = await readJsonRequest(request);
      assertSafeSyntheticPayload(payload, config);
      const fingerprint = deliveryFingerprint(payload);
      if (fingerprints.has(fingerprint)) {
        state.duplicateSendAttempts += 1;
        throw new FakeSequenzyRequestError(
          409,
          "duplicate_send",
          "The fake provider rejected a duplicate delivery fingerprint.",
        );
      }

      fingerprints.add(fingerprint);
      state.accepted += 1;
      recordStatus(state, 202);
      writeJson(response, 202, {
        success: true,
        jobId: `cadence-load-job-${state.accepted}`,
      });
    } catch (error) {
      const requestError =
        error instanceof FakeSequenzyRequestError
          ? error
          : new FakeSequenzyRequestError(
              400,
              "invalid_request",
              "The fake provider rejected an invalid request.",
            );
      state.rejected += 1;
      recordReason(state, requestError.reason);
      recordStatus(state, requestError.status);
      writeJson(response, requestError.status, {
        success: false,
        error: requestError.message,
      });
    }
  });

  server.requestTimeout = 5_000;
  server.headersTimeout = 6_000;
  server.keepAliveTimeout = 2_000;
  server.maxRequestsPerSocket = 100;

  await listen(server, config.host, config.port);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(server);
    throw new FakeSequenzyConfigurationError(
      "The local fake provider did not expose a TCP address.",
    );
  }

  const apiUrl = `http://${config.host}:${address.port}`;
  const snapshot = () => buildSnapshot(state, fingerprints.size);
  const close = () => {
    if (closePromise) return closePromise;

    closePromise = (async () => {
      if (!closed) {
        closed = true;
        await closeHttpServer(server);
      }
      const finalSnapshot = snapshot();
      if (config.snapshotPath) {
        await writeOwnerOnlySnapshot(
          config.snapshotPath,
          finalSnapshot,
        );
      }
      return finalSnapshot;
    })();
    return closePromise;
  };

  return Object.freeze({
    apiUrl,
    close,
    snapshot,
  });
}

export function assertFakeSequenzyRunEvidence(input) {
  const snapshot = input?.snapshot;
  if (
    !isPlainObject(snapshot) ||
    snapshot.target_classification !== "local" ||
    snapshot.provider !== "fake_sequenzy"
  ) {
    throw new FakeSequenzyEvidenceError(
      "Fake-provider evidence was missing or not local.",
    );
  }

  const accepted = readEvidenceCount(snapshot.accepted, "accepted");
  const rejected = readEvidenceCount(snapshot.rejected, "rejected");
  const total = readEvidenceCount(
    snapshot.requests_total,
    "requests_total",
  );
  const unique = readEvidenceCount(
    snapshot.unique_delivery_fingerprints,
    "unique_delivery_fingerprints",
  );
  const duplicates = readEvidenceCount(
    snapshot.duplicate_send_attempts,
    "duplicate_send_attempts",
  );
  const pushAttempts = readEvidenceCount(
    snapshot.web_push_attempts,
    "web_push_attempts",
  );

  if (rejected !== 0 || total !== accepted) {
    throw new FakeSequenzyEvidenceError(
      "Fake-provider evidence contains rejected requests.",
    );
  }
  if (duplicates !== 0 || unique !== accepted) {
    throw new FakeSequenzyEvidenceError(
      "Fake-provider evidence contains a duplicate send.",
    );
  }
  if (pushAttempts !== 0) {
    throw new FakeSequenzyEvidenceError(
      "Fake-provider evidence contains a Web Push attempt.",
    );
  }

  if (!Array.isArray(input.processResults) || input.processResults.length === 0) {
    throw new FakeSequenzyEvidenceError(
      "Reminder-process evidence is missing.",
    );
  }
  const aggregate = {
    sent: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const result of input.processResults) {
    const normalized = normalizeReminderProcessResult(result);
    aggregate.sent += normalized.sent;
    aggregate.failed += normalized.failed;
    aggregate.cancelled += normalized.cancelled;
  }

  const replay = normalizeReminderProcessResult(input.replayResult);
  if (replay.claimed !== 0 || replay.sent !== 0) {
    throw new FakeSequenzyEvidenceError(
      "The reminder replay was not idempotent.",
    );
  }
  if (aggregate.sent !== accepted) {
    throw new FakeSequenzyEvidenceError(
      "Accepted fake-provider sends did not reconcile with processing.",
    );
  }

  const final = input.finalDeliveryDelta;
  if (!isPlainObject(final)) {
    throw new FakeSequenzyEvidenceError(
      "Final reminder-delivery evidence is missing.",
    );
  }
  if (
    readEvidenceCount(final.sent, "final sent") !== accepted ||
    readEvidenceCount(final.failed, "final failed") !== aggregate.failed ||
    readEvidenceCount(final.cancelled, "final cancelled") <
      aggregate.cancelled
  ) {
    throw new FakeSequenzyEvidenceError(
      "Final reminder-delivery statuses did not reconcile.",
    );
  }
  if (
    readEvidenceCount(final.processing, "final processing") !== 0 ||
    readEvidenceCount(final.duplicateKeys, "final duplicate keys") !== 0
  ) {
    throw new FakeSequenzyEvidenceError(
      "Final reminder-delivery integrity checks failed.",
    );
  }
  if (
    readEvidenceCount(
      input.activePushSubscriptions,
      "active push subscriptions",
    ) !== 0
  ) {
    throw new FakeSequenzyEvidenceError(
      "The mutation run contained active Web Push subscriptions.",
    );
  }
}

export async function writeOwnerOnlySnapshot(snapshotPath, snapshot) {
  if (typeof snapshotPath !== "string" || !path.isAbsolute(snapshotPath)) {
    throw new FakeSequenzyConfigurationError(
      "The fake-provider snapshot path must be absolute.",
    );
  }
  const parent = path.dirname(snapshotPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporaryPath = `${snapshotPath}.${process.pid}.tmp`;

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      },
    );
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, snapshotPath);
    await chmod(snapshotPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function normalizeServerOptions(options) {
  if (!isPlainObject(options)) {
    throw new FakeSequenzyConfigurationError(
      "Fake-provider options are required.",
    );
  }
  if (!RUN_ID_PATTERN.test(options.runId ?? "")) {
    throw new FakeSequenzyConfigurationError(
      "The fake provider requires an exact synthetic run ID.",
    );
  }
  if (!FAKE_API_KEY_PATTERN.test(options.apiKey ?? "")) {
    throw new FakeSequenzyConfigurationError(
      "The fake provider requires a generated load-only API key.",
    );
  }
  if (
    !FAKE_TEMPLATE_SLUG_PATTERN.test(options.reminderTemplateSlug ?? "")
  ) {
    throw new FakeSequenzyConfigurationError(
      "The fake provider requires a load-only reminder template slug.",
    );
  }

  const host = options.host ?? DEFAULT_FAKE_SEQUENZY_HOST;
  if (host !== DEFAULT_FAKE_SEQUENZY_HOST) {
    throw new FakeSequenzyConfigurationError(
      "The fake provider must bind to the IPv4 loopback address.",
    );
  }
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new FakeSequenzyConfigurationError(
      "The fake-provider port must be an integer from 0 to 65535.",
    );
  }
  const maxRequests =
    options.maxRequests ?? DEFAULT_FAKE_SEQUENZY_MAX_REQUESTS;
  if (
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > MAX_FAKE_SEQUENZY_REQUESTS
  ) {
    throw new FakeSequenzyConfigurationError(
      "The fake-provider request ceiling must be between 1 and 10000.",
    );
  }
  const snapshotPath = options.snapshotPath;
  if (
    snapshotPath !== undefined &&
    (typeof snapshotPath !== "string" || !path.isAbsolute(snapshotPath))
  ) {
    throw new FakeSequenzyConfigurationError(
      "The fake-provider snapshot path must be absolute.",
    );
  }

  return {
    runId: options.runId,
    apiKey: options.apiKey,
    reminderTemplateSlug: options.reminderTemplateSlug,
    host,
    port,
    maxRequests,
    snapshotPath,
  };
}

function assertSafeSyntheticPayload(payload, config) {
  if (
    !isPlainObject(payload) ||
    !hasExactKeys(payload, TOP_LEVEL_FIELDS) ||
    !isPlainObject(payload.variables) ||
    !hasExactKeys(payload.variables, REQUIRED_VARIABLES)
  ) {
    throw unsafePayload();
  }

  const emailPattern = new RegExp(
    `^cadence-load-${escapeRegExp(config.runId)}-` +
      "(empty|typical_daily|review_heavy|export_heavy|heavy_schedule)-" +
      "[0-9]{4}@example\\.invalid$",
  );
  if (
    typeof payload.to !== "string" ||
    payload.to.length > 254 ||
    !emailPattern.test(payload.to)
  ) {
    throw unsafePayload();
  }
  if (
    typeof payload.subscriberExternalId !== "string" ||
    !UUID_PATTERN.test(payload.subscriberExternalId)
  ) {
    throw unsafePayload();
  }
  if (payload.slug !== config.reminderTemplateSlug) {
    throw unsafePayload();
  }

  const variables = payload.variables;
  if (
    !UUID_PATTERN.test(variables.BEHAVIOR_ID) ||
    !UUID_PATTERN.test(variables.OCCURRENCE_ID) ||
    !isSafeText(variables.BEHAVIOR_TITLE, 300) ||
    !OWNER_MARKER_PATTERN.test(variables.BEHAVIOR_TITLE) ||
    !isSafeText(variables.BEHAVIOR_DESCRIPTION, 2_000, true) ||
    !isSafeText(variables.SCHEDULED_TIME, 100) ||
    !isSafeText(variables.TIMEZONE, 100) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(variables.OCCURRENCE_LOCAL_DATE) ||
    !isIsoInstant(variables.OCCURRENCE_SCHEDULED_FOR) ||
    !isIsoInstant(variables.REMINDER_SCHEDULED_SEND_AT) ||
    !isLocalTimelineUrl(variables.TIMELINE_URL)
  ) {
    throw unsafePayload();
  }
}

function unsafePayload() {
  return new FakeSequenzyRequestError(
    422,
    "unsafe_payload",
    "The fake provider accepts only bounded synthetic reminder payloads.",
  );
}

function deliveryFingerprint(payload) {
  return createHash("sha256")
    .update(
      [
        payload.subscriberExternalId,
        payload.variables.OCCURRENCE_ID,
        payload.variables.REMINDER_SCHEDULED_SEND_AT,
        payload.slug,
      ].join("|"),
    )
    .digest("hex");
}

async function readJsonRequest(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_FAKE_SEQUENZY_BODY_BYTES
  ) {
    throw new FakeSequenzyRequestError(
      413,
      "payload_too_large",
      "The fake-provider payload exceeded its bounded size.",
    );
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_FAKE_SEQUENZY_BODY_BYTES) {
      throw new FakeSequenzyRequestError(
        413,
        "payload_too_large",
        "The fake-provider payload exceeded its bounded size.",
      );
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FakeSequenzyRequestError(
      400,
      "invalid_json",
      "The fake provider requires a valid JSON object.",
    );
  }
}

function normalizeReminderProcessResult(value) {
  if (!isPlainObject(value)) {
    throw new FakeSequenzyEvidenceError(
      "Reminder-process evidence contains an invalid result.",
    );
  }
  const result = {
    checked: readEvidenceCount(value.checked, "checked"),
    claimed: readEvidenceCount(value.claimed, "claimed"),
    skipped: readEvidenceCount(value.skipped, "skipped"),
    sent: readEvidenceCount(value.sent, "sent"),
    failed: readEvidenceCount(value.failed, "failed"),
    cancelled: readEvidenceCount(value.cancelled, "cancelled"),
  };
  if (
    result.claimed + result.skipped !== result.checked ||
    result.sent + result.failed + result.cancelled !== result.claimed
  ) {
    throw new FakeSequenzyEvidenceError(
      "Reminder-process aggregate counts did not reconcile.",
    );
  }
  return result;
}

function readEvidenceCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FakeSequenzyEvidenceError(
      `Fake-provider evidence contains an invalid ${label} count.`,
    );
  }
  return value;
}

function createAggregateState() {
  return {
    requestsTotal: 0,
    accepted: 0,
    rejected: 0,
    duplicateSendAttempts: 0,
    webPushAttempts: 0,
    rejectionReasons: Object.create(null),
    responseStatuses: Object.create(null),
  };
}

function buildSnapshot(state, uniqueDeliveryFingerprints) {
  return {
    schema_version: FAKE_SEQUENZY_SCHEMA_VERSION,
    target_classification: "local",
    provider: "fake_sequenzy",
    requests_total: state.requestsTotal,
    accepted: state.accepted,
    rejected: state.rejected,
    unique_delivery_fingerprints: uniqueDeliveryFingerprints,
    duplicate_send_attempts: state.duplicateSendAttempts,
    web_push_attempts: state.webPushAttempts,
    rejection_reasons: { ...state.rejectionReasons },
    response_statuses: { ...state.responseStatuses },
  };
}

function recordReason(state, reason) {
  state.rejectionReasons[reason] =
    (state.rejectionReasons[reason] ?? 0) + 1;
}

function recordStatus(state, status) {
  const key = String(status);
  state.responseStatuses[key] = (state.responseStatuses[key] ?? 0) + 1;
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function authorizationMatches(header, expectedApiKey) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(header.slice("Bearer ".length).trim());
  const expected = Buffer.from(expectedApiKey);
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

function isJsonContentType(value) {
  return (
    typeof value === "string" &&
    value.toLowerCase().split(";", 1)[0].trim() === "application/json"
  );
}

function isLoopbackAddress(value) {
  return (
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "::ffff:127.0.0.1"
  );
}

function isWebPushPath(pathname) {
  return /(^|[/_-])push([/_-]|$)/i.test(pathname);
}

function safeRequestPath(rawUrl) {
  try {
    return new URL(rawUrl ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

function isLocalTimelineUrl(value) {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "http:" &&
      LOCAL_HOSTS.has(parsed.hostname) &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/timeline"
    );
  } catch {
    return false;
  }
}

function isIsoInstant(value) {
  return (
    typeof value === "string" &&
    value.length <= 50 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isSafeText(value, maxLength, allowEmpty = false) {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  });
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeIdleConnections?.();
  });
}

function parseIntegerEnvironment(value, fallback) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

async function runCli() {
  const server = await startFakeSequenzyServer({
    runId: process.env.CADENCE_LOAD_RUN_ID,
    apiKey: process.env.CADENCE_LOAD_FAKE_SEQUENZY_API_KEY,
    reminderTemplateSlug:
      process.env.CADENCE_LOAD_FAKE_SEQUENZY_TEMPLATE_SLUG ??
      "cadence-load-habit-reminder",
    host:
      process.env.CADENCE_LOAD_FAKE_SEQUENZY_HOST ??
      DEFAULT_FAKE_SEQUENZY_HOST,
    port: parseIntegerEnvironment(
      process.env.CADENCE_LOAD_FAKE_SEQUENZY_PORT,
      0,
    ),
    maxRequests: parseIntegerEnvironment(
      process.env.CADENCE_LOAD_FAKE_SEQUENZY_MAX_REQUESTS,
      DEFAULT_FAKE_SEQUENZY_MAX_REQUESTS,
    ),
    snapshotPath:
      process.env.CADENCE_LOAD_FAKE_SEQUENZY_SNAPSHOT_FILE || undefined,
  });

  process.stdout.write(
    `${JSON.stringify({
      type: "cadence_load_fake_sequenzy_ready",
      api_url: server.apiUrl,
      target_classification: "local",
    })}\n`,
  );

  let closing = false;
  const close = async (exitCode) => {
    if (closing) return;
    closing = true;
    const snapshot = await server.close();
    process.stdout.write(
      `${JSON.stringify({
        type: "cadence_load_fake_sequenzy_stopped",
        summary: snapshot,
      })}\n`,
    );
    process.exitCode = exitCode;
  };

  process.once("SIGINT", () => {
    void close(130);
  });
  process.once("SIGTERM", () => {
    void close(143);
  });
}

function isDirectExecution() {
  const executable = process.argv[1];
  return (
    typeof executable === "string" &&
    pathToFileURL(path.resolve(executable)).href === import.meta.url
  );
}

if (isDirectExecution()) {
  runCli().catch((error) => {
    const message =
      error instanceof FakeSequenzyConfigurationError
        ? error.message
        : "The local fake provider failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
