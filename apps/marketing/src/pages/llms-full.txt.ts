import type { APIRoute } from "astro";
import { getLlmsFullTxt } from "../data/agent-output";

export const GET: APIRoute = () =>
  new Response(getLlmsFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

