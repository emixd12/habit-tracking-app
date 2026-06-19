export type MonitoringSeverity = "info" | "warning" | "error";

export type MonitoringContextValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type MonitoringContext = Record<string, MonitoringContextValue>;

export type MonitoringEvent = {
  source: "cadence";
  name: string;
  severity: MonitoringSeverity;
  context: Record<string, string | number | boolean | null>;
};

const MAX_CONTEXT_STRING_LENGTH = 120;
const SENSITIVE_KEY_PARTS = [
  "auth",
  "body",
  "description",
  "email",
  "endpoint",
  "key",
  "message",
  "note",
  "payload",
  "p256dh",
  "recipient",
  "secret",
  "subscription",
  "title",
  "token",
  "user_agent",
];

export function buildMonitoringEvent(input: {
  name: string;
  severity?: MonitoringSeverity;
  context?: MonitoringContext;
}): MonitoringEvent {
  return {
    source: "cadence",
    name: input.name,
    severity: input.severity ?? "info",
    context: sanitizeMonitoringContext(input.context ?? {}),
  };
}

export function buildMonitoringErrorEvent(input: {
  name: string;
  error: unknown;
  context?: MonitoringContext;
}): MonitoringEvent {
  return buildMonitoringEvent({
    name: input.name,
    severity: "error",
    context: {
      ...input.context,
      error_name: safeErrorName(input.error),
    },
  });
}

export function reportMonitoringEvent(input: {
  name: string;
  severity?: MonitoringSeverity;
  context?: MonitoringContext;
}): void {
  writeMonitoringEvent(buildMonitoringEvent(input));
}

export function reportMonitoringError(
  name: string,
  error: unknown,
  context?: MonitoringContext,
): void {
  writeMonitoringEvent(buildMonitoringErrorEvent({ name, error, context }));
}

export function sanitizeMonitoringContext(
  context: MonitoringContext,
): MonitoringEvent["context"] {
  const sanitized: MonitoringEvent["context"] = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || isSensitiveKey(key)) {
      continue;
    }

    sanitized[key] = sanitizeMonitoringValue(value);
  }

  return sanitized;
}

function writeMonitoringEvent(event: MonitoringEvent): void {
  const payload = JSON.stringify(event);

  if (event.severity === "error") {
    console.error(payload);
    return;
  }

  if (event.severity === "warning") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

function sanitizeMonitoringValue(
  value: Exclude<MonitoringContextValue, undefined>,
): string | number | boolean | null {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (looksLikeEmail(trimmed)) {
    return "[redacted]";
  }

  if (trimmed.length <= MAX_CONTEXT_STRING_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_CONTEXT_STRING_LENGTH - 3)}...`;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "_");

  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim()) {
    return error.name;
  }

  return "UnknownError";
}
