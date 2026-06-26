#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const DEFAULT_ROUTES = [
  "/timeline",
  "/behaviors",
  "/export",
  "/settings",
];

const baseUrl = process.env.CADENCE_PERF_BASE_URL ?? "http://localhost:3000";
const routes = parseRoutes(process.env.CADENCE_PERF_ROUTES);
const runs = parsePositiveInteger(process.env.CADENCE_PERF_RUNS, 3);
const warmups = parsePositiveInteger(process.env.CADENCE_PERF_WARMUPS, 1);
const cookieHeader = process.env.CADENCE_PERF_COOKIE_HEADER;

for (const route of routes) {
  for (let index = 0; index < warmups; index += 1) {
    await measureRoute(route, { warmup: true });
  }

  for (let index = 0; index < runs; index += 1) {
    const result = await measureRoute(route, { warmup: false });

    console.log(JSON.stringify(result));
  }
}

async function measureRoute(route, options) {
  const url = new URL(route, baseUrl);
  const startedAt = performance.now();
  let firstByteAt = null;
  let bytes = 0;
  let status = 0;

  try {
    const response = await fetch(url, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      redirect: "manual",
    });
    status = response.status;
    const reader = response.body?.getReader();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (firstByteAt === null) {
          firstByteAt = performance.now();
        }

        bytes += value.byteLength;
      }
    }

    const finishedAt = performance.now();

    return {
      route,
      status,
      warmup: options.warmup,
      ttfb_ms: round(
        firstByteAt === null ? finishedAt - startedAt : firstByteAt - startedAt,
      ),
      total_ms: round(finishedAt - startedAt),
      bytes,
    };
  } catch (error) {
    const finishedAt = performance.now();

    return {
      route,
      status,
      warmup: options.warmup,
      total_ms: round(finishedAt - startedAt),
      error_name: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

function parseRoutes(value) {
  if (!value) {
    return DEFAULT_ROUTES;
  }

  const parsed = value
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
    .map((route) => (route.startsWith("/") ? route : `/${route}`));

  return parsed.length > 0 ? parsed : DEFAULT_ROUTES;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
