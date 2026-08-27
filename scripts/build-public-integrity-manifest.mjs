import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { allowedUrl, boundedFetch } from "./public-trust-http.mjs";

export async function buildIntegrityManifest({ assets, origins, fetchedAt, fetcher, maxAssets = 32, localRoot = new URL("..", import.meta.url) }) {
  if (!Array.isArray(assets) || assets.length === 0 || assets.length > maxAssets) throw new Error("Asset count is outside the bounded allowlist.");
  const entries = [];
  for (const asset of assets) {
    const origin = origins[asset.surface];
    if (!origin) throw new Error(`Missing allowlisted origin for ${asset.surface}.`);
    const targetUrl = allowedUrl(origin, asset.path).toString();
    try {
      const { response, body, finalUrl } = await boundedFetch(origin, asset.path, { fetcher });
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      const digest = createHash("sha256").update(body).digest("hex");
      const expectedDigest = asset.local_path ? createHash("sha256").update(await readFile(new URL(asset.local_path, localRoot))).digest("hex") : asset.sha256;
      const ok = response.status === 200 && contentType === asset.content_type && (!expectedDigest || expectedDigest === digest);
      entries.push({ path: asset.path, surface: asset.surface, status: response.status, content_type: contentType, bytes: body.length, sha256: digest, final_url: finalUrl, verified_at: fetchedAt, ok });
    } catch {
      entries.push({ path: asset.path, surface: asset.surface, status: 0, content_type: "", bytes: 0, sha256: null, final_url: targetUrl, verified_at: fetchedAt, ok: false });
    }
  }
  return { status: entries.every((entry) => entry.ok) ? "passed" : "failed", entries };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
  const config = JSON.parse(await readFile(args.config, "utf8"));
  const result = await buildIntegrityManifest({ assets: config.assets, maxAssets: config.max_assets, origins: { application: args.applicationOrigin, marketing: args.marketingOrigin }, fetchedAt: args.verifiedAt });
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
