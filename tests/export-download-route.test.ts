import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportDownloadResponse } from "../app/api/export/_shared";
import {
  ExportAuthError,
  ExportRateLimitError,
  getExportDownload,
} from "@/lib/services/export.service";
import { LaunchCircuitBreakerOpenError } from "@/lib/security/launch-circuit-breakers";

vi.mock("@/lib/services/export.service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/services/export.service")
  >();

  return {
    ...actual,
    getExportDownload: vi.fn(),
  };
});

describe("export download response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps anonymous requests on the JSON 401 contract", async () => {
    vi.mocked(getExportDownload).mockRejectedValue(new ExportAuthError());

    const response = await exportDownloadResponse(exportRequest(), "json");

    expect(response.status).toBe(401);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("returns stable 429 guidance without preparing a partial download", async () => {
    vi.mocked(getExportDownload).mockRejectedValue(
      new ExportRateLimitError({
        limit: 6,
        remaining: 0,
        retryAfterSeconds: 41,
      }),
    );

    const response = await exportDownloadResponse(exportRequest(), "json");

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Too many export downloads. Try again later.",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("41");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a scoped unavailable response when export downloads are disabled", async () => {
    vi.mocked(getExportDownload).mockRejectedValue(
      new LaunchCircuitBreakerOpenError({
        name: "export_downloads",
        open: true,
        reasonCode: "cost_surge",
        retryAfterSeconds: 300,
      }),
    );

    const response = await exportDownloadResponse(exportRequest(), "json");

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Export downloads are temporarily unavailable.",
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
  });

  it("passes time tracking only for the exact opt-in parameter", async () => {
    vi.mocked(getExportDownload).mockRejectedValue(new ExportAuthError());

    for (const value of ["true", "on", "1%20"]) {
      await exportDownloadResponse(
        exportRequest(`?include_time_tracking=${value}`),
        "json",
      );
      expect(getExportDownload).toHaveBeenLastCalledWith("json", {
        range: null,
        includeArchived: false,
        includeNotes: false,
        includeTimeTracking: false,
      });
    }

    await exportDownloadResponse(
      exportRequest("?include_time_tracking=1"),
      "json",
    );
    expect(getExportDownload).toHaveBeenLastCalledWith("json", {
      range: null,
      includeArchived: false,
      includeNotes: false,
      includeTimeTracking: true,
    });
  });
});

function exportRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/export/json${query}`, {
    method: "GET",
  });
}
