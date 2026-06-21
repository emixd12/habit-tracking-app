import type { APIRoute } from "astro";
import { getRouteManifestJson } from "../../data/agent-output";

export const GET: APIRoute = () =>
  new Response(getRouteManifestJson(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });

