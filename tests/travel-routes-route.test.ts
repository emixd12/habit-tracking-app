import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("@/lib/services/google-calendar-request", () => ({
  calendarPreflight: vi.fn(),
  authenticateCalendarRequest: mocks.authenticate,
  calendarResponse: (_request: Request, body: unknown, status = 200) => Response.json(body, { status }),
}));

import { GET, POST } from "@/app/api/travel/routes/route";

describe("travel routes route", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("rejects before it reads request locations when clearance is disabled", async () => {
    mocks.authenticate.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(new Request("http://localhost/api/travel/routes", { method: "POST", body: "ignored" }));
    await expect(response.json()).resolves.toMatchObject({ error: "provider_clearance_required", accountId: "owner" });
    expect(response.status).toBe(503);
  });

  it("requires the runtime Vercel OIDC header for hosted configuration", async () => {
    mocks.authenticate.mockResolvedValue({ user: { id: "owner" } });
    const env = {
      CADENCE_TRAVEL_PROVIDER_CLEARANCE: "approved",
      CADENCE_TRAVEL_GOOGLE_AUTH_MODE: "workload_identity",
      GOOGLE_CLOUD_PROJECT_ID: "habit-tracker-498717",
      GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER: "//iam.googleapis.com/projects/646154863146/locations/global/workloadIdentityPools/vercel-cadence/providers/cadence-production",
      GOOGLE_CLOUD_TRAVEL_SERVICE_ACCOUNT_EMAIL: "cadence-travel@habit-tracker-498717.iam.gserviceaccount.com",
      CADENCE_TRAVEL_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/emis-projects-4c886aeb",
      CADENCE_TRAVEL_VERCEL_OIDC_AUDIENCE: "https://vercel.com/emis-projects-4c886aeb",
      CADENCE_TRAVEL_VERCEL_OIDC_SUBJECT: "owner:emis-projects-4c886aeb:project:cadence:environment:production",
      CADENCE_TRAVEL_VERCEL_OIDC_OWNER_ID: "team_BxWfRYU1gqrl6Ba6t7Vm3wp1",
      CADENCE_TRAVEL_VERCEL_OIDC_PROJECT_ID: "prj_9tZKRXZ6IdT56ZLKVSmoJH5AAYhs",
      CADENCE_TRAVEL_VERCEL_OIDC_ENVIRONMENT: "production",
    };
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const missing = await GET(new Request("http://localhost/api/travel/routes"));
    await expect(missing.json()).resolves.toMatchObject({ configured: false });
    const present = await GET(new Request("http://localhost/api/travel/routes", {
      headers: { "x-vercel-oidc-token": "request-token" },
    }));
    await expect(present.json()).resolves.toMatchObject({ configured: true });
  });
});
