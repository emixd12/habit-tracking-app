import { defineConfig } from "astro/config";

const site =
  process.env.MARKETING_SITE_URL ?? "https://cadence-marketing-two.vercel.app";

export default defineConfig({
  site,
  output: "static",
});
