import { describe, expect, it } from "vitest";

import {
  assertSanitizedArtifact,
  countCsvDataRows,
  countUnexpected5xxFailures,
  evaluateRecoveryGate,
  evaluateStageGates,
  parseCsv,
  parseLocustPeakUsers,
  parseLocustStatsCsv,
  sanitizeLoadOutput,
  // @ts-expect-error The report helper is a plain Node ESM module.
} from "../scripts/load-test-read-report.mjs";

const STATS_CSV = [
  "Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%",
  'GET,"INT-SHELL-001 GET /timeline protected-document",10,0,100,102,80,150,2048,2.5,0,100,100,110,110,120,130,140,145,150,150,150',
  ",Aggregated,10,0,100,102,80,150,2048,2.5,0,100,100,110,110,120,130,140,145,150,150,150",
  "",
].join("\n");

describe("Ticket 064 load report helpers", () => {
  it("parses quoted Locust CSV rows and aggregate percentiles", () => {
    expect(parseCsv('name,error\nrequest,"value, with comma"\n')).toEqual([
      ["name", "error"],
      ["request", "value, with comma"],
    ]);

    expect(parseLocustStatsCsv(STATS_CSV)).toEqual({
      requests: 10,
      failures: 0,
      failure_ratio_percent: 0,
      requests_per_second: 2.5,
      average_response_bytes: 2048,
      response_bytes: 20480,
      latency_ms: {
        p50: 100,
        p75: 110,
        p95: 130,
        p99: 145,
      },
      requests_by_name: [
        {
          method: "GET",
          name: "INT-SHELL-001 GET /timeline protected-document",
          requests: 10,
          failures: 0,
          failure_ratio_percent: 0,
          requests_per_second: 2.5,
          average_response_bytes: 2048,
          response_bytes: 20480,
          latency_ms: {
            p50: 100,
            p75: 110,
            p95: 130,
            p99: 145,
          },
        },
      ],
    });
  });

  it("retains a zero-request Locust aggregate for fail-closed reporting", () => {
    const emptyStats = STATS_CSV.split("\n")
      .filter(
        (line) =>
          !line.startsWith(
            'GET,"INT-SHELL-001 GET /timeline protected-document"',
          ),
      )
      .map((line) =>
        line.startsWith(",Aggregated,")
          ? ",Aggregated,0,0,0,0,0,0,0,0,0,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A"
          : line,
      )
      .join("\n");

    expect(parseLocustStatsCsv(emptyStats)).toMatchObject({
      requests: 0,
      failures: 0,
      failure_ratio_percent: 100,
      latency_ms: {
        p50: 0,
        p75: 0,
        p95: 0,
        p99: 0,
      },
      requests_by_name: [],
    });
  });

  it("counts failure and exception rows without treating headers as data", () => {
    expect(countCsvDataRows("Method,Name,Error\n")).toBe(0);
    expect(
      countUnexpected5xxFailures(
        'Method,Name,Error\nGET,Timeline,"Unexpected 5xx response."\n',
      ),
    ).toBe(1);
    expect(
      countUnexpected5xxFailures(
        'Method,Name,Error\nGET,Timeline,"Unexpected 401 response."\n',
      ),
    ).toBe(0);
    expect(
      countUnexpected5xxFailures(
        'Method,Name,Error,Occurrences\nGET,Timeline,"Unexpected 503 response.",3\n',
      ),
    ).toBe(3);
  });

  it("records achieved peak users from Locust history", () => {
    expect(
      parseLocustPeakUsers(
        [
          "Timestamp,User Count,Type,Name,Requests/s",
          "1,0,,Aggregated,0",
          "2,5,,Aggregated,1",
          "3,3,,Aggregated,1",
          "",
        ].join("\n"),
      ),
    ).toBe(5);
  });

  it("applies warm-baseline, failure, 5xx, and exception gates", () => {
    const metrics = parseLocustStatsCsv(STATS_CSV);

    expect(
      evaluateStageGates({
        stage: "ramp-25",
        metrics,
        warmBaselineP95: 70,
        unexpected5xx: 0,
        exceptionCount: 0,
      }),
    ).toMatchObject({ passed: true });

    expect(
      evaluateStageGates({
        stage: "ramp-25",
        metrics: {
          ...metrics,
          failure_ratio_percent: 0.5,
          latency_ms: { ...metrics.latency_ms, p95: 141 },
        },
        warmBaselineP95: 70,
        unexpected5xx: 1,
        exceptionCount: 1,
        resourceBreaches: ["app RSS"],
        declaredDurationSeconds: 240,
        achievedDurationSeconds: 30,
        declaredUsers: 25,
        achievedPeakUsers: 10,
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        expect.stringContaining("5xx"),
        expect.stringContaining("exceptions"),
        expect.stringContaining("below 0.5%"),
        expect.stringContaining("2x"),
        expect.stringContaining("resource ceiling"),
        expect.stringContaining("declared bounded duration"),
        expect.stringContaining("active-user ceiling"),
      ]),
    });
  });

  it("requires recovery latency and failures to return to the 10-user baseline", () => {
    const baseline = parseLocustStatsCsv(STATS_CSV);
    expect(
      evaluateRecoveryGate({
        baseline,
        recovery: {
          ...baseline,
          latency_ms: { ...baseline.latency_ms, p95: 143 },
        },
      }),
    ).toMatchObject({ passed: true });

    expect(
      evaluateRecoveryGate({
        baseline,
        recovery: {
          ...baseline,
          failure_ratio_percent: 0.01,
          latency_ms: { ...baseline.latency_ms, p95: 144 },
        },
      }),
    ).toMatchObject({ passed: false });
  });

  it("redacts and rejects private session material in retained artifacts", () => {
    const privateText = [
      "cadence-load-20260729t120000z-abcdef123456-typical_daily-0001@example.invalid",
      "cadence-owner-abcdef1234567890abcd",
      "eyJabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
      "/Users/example/private",
    ].join(" ");
    const sanitized = sanitizeLoadOutput(privateText, [
      { value: "/Users/example", label: "[home]" },
    ]);

    expect(sanitized).not.toContain("example.invalid");
    expect(sanitized).not.toContain("cadence-owner-");
    expect(sanitized).not.toContain("/Users/example");
    expect(() =>
      assertSanitizedArtifact({
        content: sanitized,
        label: "test artifact",
      }),
    ).not.toThrow();
    expect(() =>
      assertSanitizedArtifact({
        content: privateText,
        label: "test artifact",
      }),
    ).toThrow(/retained private/);
  });
});
