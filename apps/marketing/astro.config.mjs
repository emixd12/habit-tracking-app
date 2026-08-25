import { defineConfig } from "astro/config";

const site =
  process.env.MARKETING_SITE_URL ?? "https://cadence-marketing-two.vercel.app";

export default defineConfig({
  site,
  output: "static",
  // Astro 7 defaults to JSX whitespace compression. Keep Astro 6's HTML
  // compression so the generated marketing copy preserves its existing spaces.
  compressHTML: true,
  redirects: {
    "/cadence": "/",
    "/standard": "/",
  },
});
