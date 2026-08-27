import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validatePublicTrustEvidence } from "../lib/resolvers/public-trust-evidence.resolver.ts";
import { boundedFetch } from "./public-trust-http.mjs";
import { validatePublicTrustDetails } from "./publish-public-trust-evidence.mjs";

export async function downloadPublicTrustHistory({ origin, outputDirectory, fetcher = fetch, allowEmpty = false }) {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  const index = await boundedFetch(origin, new URL("trust/snapshots.json", base).toString(), { fetcher });
  if (index.response.status === 404) {
    if (!allowEmpty) throw new Error("Public Trust history is missing; empty initialization was not authorized.");
    await mkdir(outputDirectory, { recursive: true });
    return 0;
  }
  if (index.response.status !== 200) throw new Error("Unable to read the existing public snapshot index.");
  const urls = JSON.parse(index.body.toString("utf8"));
  if (!Array.isArray(urls) || urls.length > 1_000) throw new Error("Existing snapshot index exceeds the retention bound.");
  for (const value of urls) {
    const url = new URL(value);
    if (url.origin !== new URL(origin).origin || !url.pathname.startsWith(new URL(origin).pathname.replace(/\/?$/, "/") + "trust/")) throw new Error("Existing snapshot index escaped the Pages origin.");
    const result = await boundedFetch(origin, url.toString(), { fetcher });
    const snapshot = JSON.parse(result.body.toString("utf8"));
    const validation = validatePublicTrustEvidence(snapshot);
    if (!validation.ok || snapshot.snapshot_url !== value) throw new Error("Existing snapshot failed immutable validation.");
    const relative = url.pathname.slice(url.pathname.indexOf("/trust/") + 1);
    const target = path.join(outputDirectory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
    const detailsUrl = snapshot.checks[0].evidence_url;
    if (detailsUrl !== snapshot.snapshot_url) {
      const detailsResult = await boundedFetch(origin, detailsUrl, { fetcher });
      if (detailsResult.response.status !== 200) throw new Error("Existing immutable Trust details are missing.");
      const details = JSON.parse(detailsResult.body.toString("utf8"));
      validatePublicTrustDetails(details, snapshot);
      await writeFile(path.join(path.dirname(target), path.basename(new URL(detailsUrl).pathname)), `${JSON.stringify(details, null, 2)}\n`, { flag: "wx" });
    }
  }
  await mkdir(path.join(outputDirectory, "trust"), { recursive: true });
  await writeFile(path.join(outputDirectory, "trust", "snapshots.json"), `${JSON.stringify(urls, null, 2)}\n`);
  return urls.length;
}

async function main() {
  const value = (name) => process.argv[process.argv.indexOf(name) + 1];
  await downloadPublicTrustHistory({ origin: value("--origin"), outputDirectory: value("--output"), allowEmpty: process.argv.includes("--allow-empty") });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
