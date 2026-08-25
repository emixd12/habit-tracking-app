import {
  PROVIDER_CALL_TIMEOUT_MS,
  runProviderCallWithTimeout,
} from "@/lib/services/provider-call-timeout";

export type SequenzyTemplateVariables = Record<
  string,
  string | number | boolean | null
>;

export type SequenzyReminderEmailInput = {
  to: string;
  subscriberExternalId: string;
  variables: SequenzyTemplateVariables;
};

export type SequenzySendResult = {
  jobId: string | null;
};

export type SequenzyRuntimeConfig = {
  apiKey: string;
  apiUrl: string;
  reminderTemplateSlug: string;
};

export type SequenzyFetch = typeof fetch;

export type SequenzySendOptions = {
  signal?: AbortSignal;
};

export class SequenzyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SequenzyConfigurationError";
  }
}

export class SequenzySendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SequenzySendError";
  }
}

const DEFAULT_SEQUENZY_API_URL = "https://api.sequenzy.com";

export function getSequenzyRuntimeConfig(): SequenzyRuntimeConfig {
  const apiKey = normalizeEnvValue(process.env.SEQUENZY_API_KEY);
  const reminderTemplateSlug = normalizeEnvValue(
    process.env.SEQUENZY_REMINDER_TEMPLATE_SLUG,
  );
  const apiUrl =
    normalizeEnvValue(process.env.SEQUENZY_API_URL) ?? DEFAULT_SEQUENZY_API_URL;

  if (!apiKey) {
    throw new SequenzyConfigurationError(
      "Missing SEQUENZY_API_KEY for email reminder sending.",
    );
  }

  if (!reminderTemplateSlug) {
    throw new SequenzyConfigurationError(
      "Missing SEQUENZY_REMINDER_TEMPLATE_SLUG for email reminder sending.",
    );
  }

  return {
    apiKey,
    apiUrl,
    reminderTemplateSlug,
  };
}

export function createSequenzyReminderEmailSender(
  config: SequenzyRuntimeConfig = getSequenzyRuntimeConfig(),
  fetcher: SequenzyFetch = fetch,
) {
  return (input: SequenzyReminderEmailInput, options?: SequenzySendOptions) =>
    sendSequenzyReminderEmail(input, {
      config,
      fetcher,
      signal: options?.signal,
    });
}

export async function sendSequenzyReminderEmail(
  input: SequenzyReminderEmailInput,
  options: {
    config?: SequenzyRuntimeConfig;
    fetcher?: SequenzyFetch;
    signal?: AbortSignal;
  } = {},
): Promise<SequenzySendResult> {
  const config = options.config ?? getSequenzyRuntimeConfig();
  const fetcher = options.fetcher ?? fetch;
  const response = await runProviderCallWithTimeout(
    (signal) =>
      fetcher(buildTransactionalSendUrl(config.apiUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: input.to,
          subscriberExternalId: input.subscriberExternalId,
          slug: config.reminderTemplateSlug,
          variables: input.variables,
        }),
        signal,
      }),
    {
      timeoutMs: PROVIDER_CALL_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  const payload = parseJsonObject(await response.text());

  if (!response.ok || payload?.success === false) {
    throw new SequenzySendError(
      extractProviderError(payload) ??
        `Sequenzy email send failed with HTTP ${response.status}.`,
    );
  }

  return {
    jobId: typeof payload?.jobId === "string" ? payload.jobId : null,
  };
}

function buildTransactionalSendUrl(apiUrl: string): string {
  const normalizedApiUrl = apiUrl.replace(/\/+$/, "");
  const apiPrefix = normalizedApiUrl.endsWith("/api/v1") ? "" : "/api/v1";

  return `${normalizedApiUrl}${apiPrefix}/transactional/send`;
}

function extractProviderError(
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}
