export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export type InMemoryRateLimiterOptions = {
  maxAttempts: number;
  windowMs: number;
  now?: () => number;
};

type RateLimitBucket = {
  attempts: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(options: InMemoryRateLimiterOptions) {
    if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new Error("Rate limiter maxAttempts must be a positive integer.");
    }

    if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
      throw new Error("Rate limiter windowMs must be a positive integer.");
    }

    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    const bucket = this.readBucket(key);

    return this.toResult(bucket, false);
  }

  recordFailure(key: string): RateLimitResult {
    const bucket = this.readBucket(key);

    bucket.attempts += 1;
    this.buckets.set(key, bucket);

    return this.toResult(bucket, true);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }

  private readBucket(key: string): RateLimitBucket {
    const currentTime = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      return {
        attempts: 0,
        resetAt: currentTime + this.windowMs,
      };
    }

    return existing;
  }

  private toResult(
    bucket: RateLimitBucket,
    allowCurrentAttempt: boolean,
  ): RateLimitResult {
    const remaining = Math.max(0, this.maxAttempts - bucket.attempts);

    return {
      allowed: allowCurrentAttempt
        ? bucket.attempts <= this.maxAttempts
        : bucket.attempts < this.maxAttempts,
      limit: this.maxAttempts,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.resetAt - this.now()) / 1000),
      ),
    };
  }
}
