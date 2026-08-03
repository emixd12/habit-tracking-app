import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const MAX_UNEXPECTED_FAILURE_RATIO_PERCENT = 0.5;
export const MAX_WARM_P95_MULTIPLIER = 2;
export const MAX_RECOVERY_P95_MULTIPLIER = 1.1;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Load result CSV has an unterminated field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
}

export function parseLocustStatsCsv(text) {
  const [headers, ...values] = parseCsv(text);
  if (!headers) throw new Error("Locust stats CSV is empty.");

  const rows = values.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
  const aggregate = rows.find((row) => row.Name === "Aggregated");
  if (!aggregate) {
    throw new Error("Locust stats CSV lacks its aggregate row.");
  }

  const aggregateMetrics = metricsFromRow(aggregate);
  return {
    ...aggregateMetrics,
    requests_by_name: rows
      .filter((row) => row.Name && row.Name !== "Aggregated")
      .map((row) => ({
        method: row.Type,
        name: row.Name,
        ...metricsFromRow(row),
      })),
  };
}

function metricsFromRow(row) {
  const requestCount = readMetricInteger(row, "Request Count");
  const failureCount = readMetricInteger(row, "Failure Count");
  const averageResponseBytes = readMetricNumber(
    row,
    "Average Content Size",
  );
  return {
    requests: requestCount,
    failures: failureCount,
    failure_ratio_percent:
      requestCount === 0 ? 100 : (failureCount / requestCount) * 100,
    requests_per_second: readMetricNumber(row, "Requests/s"),
    average_response_bytes: averageResponseBytes,
    response_bytes: Math.round(requestCount * averageResponseBytes),
    latency_ms: {
      p50: readLocustLatencyMetric(row, "50%", requestCount),
      p75: readLocustLatencyMetric(row, "75%", requestCount),
      p95: readLocustLatencyMetric(row, "95%", requestCount),
      p99: readLocustLatencyMetric(row, "99%", requestCount),
    },
  };
}

export function countCsvDataRows(text) {
  const rows = parseCsv(text);
  return Math.max(0, rows.length - 1);
}

export function parseLocustPeakUsers(text) {
  const [headers, ...values] = parseCsv(text);
  if (!headers) throw new Error("Locust history CSV is empty.");
  const userIndex = headers.indexOf("User Count");
  const nameIndex = headers.indexOf("Name");
  if (userIndex < 0 || nameIndex < 0) {
    throw new Error("Locust history CSV lacks user-count columns.");
  }

  let peak = 0;
  for (const row of values) {
    if (row[nameIndex] !== "Aggregated") continue;
    const count = Number(row[userIndex]);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Locust history contains an invalid user count.");
    }
    peak = Math.max(peak, count);
  }
  return peak;
}

export function countUnexpected5xxFailures(text) {
  if (!text.trim()) return 0;
  const rows = parseCsv(text);
  if (rows.length <= 1) return 0;

  const headers = rows[0];
  const errorIndex = headers.findIndex((header) =>
    /error|message|exception/i.test(header),
  );
  const occurrencesIndex = headers.indexOf("Occurrences");

  return rows.slice(1).reduce((total, row) => {
    const searchable =
      errorIndex >= 0 ? row[errorIndex] ?? "" : row.join(" ");
    if (!/\b5xx\b|\b5[0-9]{2}\b/i.test(searchable)) {
      return total;
    }
    if (occurrencesIndex < 0) return total + 1;
    const occurrences = Number(row[occurrencesIndex]);
    if (!Number.isSafeInteger(occurrences) || occurrences <= 0) {
      throw new Error(
        "Locust failure CSV contains an invalid Occurrences count.",
      );
    }
    if (!Number.isSafeInteger(total + occurrences)) {
      throw new Error(
        "Locust failure CSV occurrence count is unsafe.",
      );
    }
    return total + occurrences;
  }, 0);
}

export function evaluateStageGates({
  stage,
  metrics,
  warmBaselineP95,
  unexpected5xx,
  exceptionCount,
  resourceBreaches = [],
  declaredDurationSeconds,
  achievedDurationSeconds,
  declaredUsers,
  achievedPeakUsers,
}) {
  const failures = [];

  if (metrics.requests <= 0) {
    failures.push("no timed requests were recorded");
  }
  if (unexpected5xx !== 0) {
    failures.push("one or more unexpected 5xx responses were recorded");
  }
  if (exceptionCount !== 0) {
    failures.push("one or more Locust worker exceptions were recorded");
  }
  if (resourceBreaches.length > 0) {
    failures.push(
      `declared resource ceiling breached: ${resourceBreaches.join(", ")}`,
    );
  }
  if (
    declaredDurationSeconds !== undefined &&
    achievedDurationSeconds !== undefined &&
    achievedDurationSeconds < declaredDurationSeconds - 2
  ) {
    failures.push("the stage ended before its declared bounded duration");
  }
  if (
    declaredUsers !== undefined &&
    achievedPeakUsers !== undefined &&
    achievedPeakUsers < declaredUsers
  ) {
    failures.push("the stage never reached its declared active-user ceiling");
  }
  if (
    metrics.failure_ratio_percent >=
    MAX_UNEXPECTED_FAILURE_RATIO_PERCENT
  ) {
    failures.push(
      `unexpected request failures were not below ${MAX_UNEXPECTED_FAILURE_RATIO_PERCENT}%`,
    );
  }
  if (
    warmBaselineP95 !== undefined &&
    metrics.latency_ms.p95 >
      warmBaselineP95 * MAX_WARM_P95_MULTIPLIER
  ) {
    failures.push(
      `p95 exceeded ${MAX_WARM_P95_MULTIPLIER}x the one-user warm baseline`,
    );
  }

  return {
    stage,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateRecoveryGate({
  baseline,
  recovery,
}) {
  const failures = [];
  const maximumP95 =
    baseline.latency_ms.p95 * MAX_RECOVERY_P95_MULTIPLIER;
  const maximumFailureRatio =
    baseline.failure_ratio_percent === 0
      ? 0
      : baseline.failure_ratio_percent * MAX_RECOVERY_P95_MULTIPLIER;

  if (recovery.latency_ms.p95 > maximumP95) {
    failures.push(
      `recovery p95 exceeded ${Math.round(
        (MAX_RECOVERY_P95_MULTIPLIER - 1) * 100,
      )}% above the pre-ramp 10-user baseline`,
    );
  }
  if (recovery.failure_ratio_percent > maximumFailureRatio) {
    failures.push(
      "recovery failure ratio did not return within 10% of the pre-ramp baseline",
    );
  }

  return {
    stage: "recovery-10",
    passed: failures.length === 0,
    failures,
  };
}

export function sanitizeLoadOutput(value, replacements = []) {
  let sanitized = String(value);

  for (const replacement of replacements) {
    if (typeof replacement?.value !== "string" || !replacement.value) continue;
    sanitized = sanitized.split(replacement.value).join(replacement.label);
  }

  return sanitized
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[redacted-id]",
    )
    .replace(
      /\bcadence-load-[a-z0-9_-]+@example\.invalid\b/gi,
      "[redacted-email]",
    )
    .replace(
      /\bcadence-owner-[a-f0-9]{20}\b/gi,
      "[redacted-owner-marker]",
    )
    .replace(
      /\bsb-[a-z0-9.-]+-auth-token(?:\.\d+)?\b/gi,
      "[redacted-cookie]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]")
    .replace(
      /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g,
      "[redacted-key]",
    );
}

export function assertSanitizedArtifact({
  content,
  secretNeedles = [],
  label,
}) {
  const forbiddenPatterns = [
    /\bcadence-load-[a-z0-9_-]+@example\.invalid\b/i,
    /\bcadence-owner-[a-f0-9]{20}\b/i,
    /\bsb-[a-z0-9.-]+-auth-token(?:\.\d+)?\b/i,
    /\beyJ[A-Za-z0-9_-]{32,}\b/,
    /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/i,
  ];

  if (
    forbiddenPatterns.some((pattern) => pattern.test(content)) ||
    secretNeedles.some(
      (needle) => typeof needle === "string" && needle && content.includes(needle),
    )
  ) {
    throw new Error(`${label} retained private load-session material.`);
  }
}

export function summarizeArtifactDigest(filePath) {
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex");
}

function readMetricNumber(row, name) {
  const value = Number(row[name]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Locust aggregate metric ${name} is invalid.`);
  }
  return value;
}

function readLocustLatencyMetric(row, name, requestCount) {
  const value = row[name];
  if (
    requestCount === 0 &&
    (value === "N/A" || value === "")
  ) {
    return 0;
  }
  return readMetricNumber(row, name);
}

function readMetricInteger(row, name) {
  const value = readMetricNumber(row, name);
  if (!Number.isInteger(value)) {
    throw new Error(`Locust aggregate metric ${name} is not an integer.`);
  }
  return value;
}
