import type { APIRoute } from "astro";
import { getRobotsTxt } from "../data/agent-output";

export const GET: APIRoute = () =>
  new Response(getRobotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

