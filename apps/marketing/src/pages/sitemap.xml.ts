import type { APIRoute } from "astro";
import { getSitemapXml } from "../data/agent-output";

export const GET: APIRoute = () =>
  new Response(getSitemapXml(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });

