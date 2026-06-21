import type { APIRoute } from "astro";
import { getMarkdownMirror } from "../data/agent-output";

export const GET: APIRoute = () =>
  new Response(getMarkdownMirror("home"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });

