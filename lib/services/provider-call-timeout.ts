export const PROVIDER_CALL_TIMEOUT_MS = 10_000;

export class ProviderCallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Provider call timed out after ${timeoutMs} ms.`);
    this.name = "ProviderCallTimeoutError";
  }
}

export async function runProviderCallWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);

  if (signal.aborted) {
    throw new ProviderCallTimeoutError(timeoutMs);
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener("abort", handleAbort);
      reject(new ProviderCallTimeoutError(timeoutMs));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    Promise.resolve()
      .then(() => operation(signal))
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", handleAbort);
      });
  });
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return PROVIDER_CALL_TIMEOUT_MS;
  }

  return Math.max(1, Math.trunc(value));
}
