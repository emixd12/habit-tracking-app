#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { hasMainLandmark } from "./agent-readability-html.mjs";

const root = process.cwd();
const dist = join(root, "dist");
const failures = [];
const warnings = [];

if (!existsSync(dist)) {
  fail("Marketing dist directory is missing. Run `npm run build` in apps/marketing first.");
} else {
  checkBuiltOutput();
}

if (failures.length > 0) {
  console.error(`marketing agent-readability check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("marketing agent-readability check passed.");
for (const warning of warnings) console.warn(`warning: ${warning}`);

function checkBuiltOutput() {
  const requiredFiles = [
    "index.html",
    "standard/index.html",
    "cadence/index.html",
    "examples/index.html",
    "docs/index.html",
    "about/index.html",
    "index.md",
    "standard.md",
    "cadence.md",
    "examples.md",
    "docs.md",
    "about.md",
    "llms.txt",
    ".well-known/llms.txt",
    "llms-full.txt",
    "sitemap.xml",
    "robots.txt",
    "data/route-manifest.json",
    "examples/cadence-demo.behaviorlog.zip",
  ];

  for (const file of requiredFiles) {
    if (!existsSync(join(dist, file))) {
      fail(`Missing generated marketing file: ${file}`);
    }
  }

  if (failures.length > 0) return;

  const manifest = JSON.parse(read("data/route-manifest.json"));
  assert(Array.isArray(manifest.routes), "Route manifest must contain routes array.");
  assert(manifest.routes.length === 6, "Route manifest should expose 6 public routes.");

  for (const route of manifest.routes) {
    assert(route.is_public === true, `Route ${route.route_id} must be public.`);
    assert(!route.url.includes("/timeline"), `Protected app path leaked into manifest: ${route.url}`);
    assert(!route.url.includes("/settings"), `Protected app path leaked into manifest: ${route.url}`);
    assert(Boolean(route.canonical_url), `Route ${route.route_id} missing canonical_url.`);
    assert(Boolean(route.markdown_url), `Route ${route.route_id} missing markdown_url.`);
    assert(Boolean(route.description), `Route ${route.route_id} missing description.`);
    assert(Boolean(route.last_modified), `Route ${route.route_id} missing last_modified.`);
  }

  const llmsSize = statSync(join(dist, "llms.txt")).size;
  assert(llmsSize > 0, "llms.txt must not be empty.");
  assert(llmsSize < 50_000, "llms.txt must stay under 50 KB.");

  for (const markdownFile of ["index.md", "standard.md", "cadence.md", "examples.md", "docs.md", "about.md"]) {
    const size = statSync(join(dist, markdownFile)).size;
    assert(size <= 100_000, `${markdownFile} must stay at or below 100 KB.`);
    const content = read(markdownFile);
    assert(content.includes("canonical_url:"), `${markdownFile} missing canonical frontmatter.`);
    assert(!containsSecretLikeText(content), `${markdownFile} contains secret-like text.`);
  }

  const robots = read("robots.txt");
  assert(robots.includes("Sitemap:"), "robots.txt must include Sitemap.");
  assert(!/Disallow:\s*\/llms\.txt/i.test(robots), "robots.txt must not block llms.txt.");
  assert(!/Disallow:\s*\/sitemap\.xml/i.test(robots), "robots.txt must not block sitemap.xml.");

  const sitemap = read("sitemap.xml");
  for (const route of manifest.routes) {
    assert(sitemap.includes(`<loc>${route.canonical_url}</loc>`), `sitemap.xml missing ${route.canonical_url}.`);
    assert(sitemap.includes(`<lastmod>${route.last_modified}</lastmod>`), `sitemap.xml missing lastmod for ${route.route_id}.`);
  }

  for (const htmlFile of [
    "index.html",
    "standard/index.html",
    "cadence/index.html",
    "examples/index.html",
    "docs/index.html",
    "about/index.html",
  ]) {
    const html = read(htmlFile);
    assert(hasMainLandmark(html), `${htmlFile} missing main landmark.`);
    assert(html.includes('rel="canonical"'), `${htmlFile} missing canonical link.`);
    assert(html.includes('rel="alternate" type="text/markdown"'), `${htmlFile} missing markdown alternate.`);
    assert(html.includes('application/ld+json'), `${htmlFile} missing JSON-LD.`);
    assert(countMatches(html, /<h1[\s>]/g) === 1, `${htmlFile} must contain exactly one h1.`);
    assert(!html.includes("gtag("), `${htmlFile} must not include analytics script.`);
    assert(!html.includes("googletagmanager"), `${htmlFile} must not include tag manager.`);
  }

  const bundleSize = statSync(join(dist, "examples/cadence-demo.behaviorlog.zip")).size;
  assert(bundleSize > 0, "Example BehaviorLog bundle must not be empty.");
}

function read(relativePath) {
  return readFileSync(join(dist, relativePath), "utf8");
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function containsSecretLikeText(value) {
  return /(sk-[a-z0-9_-]{20,}|service_role|private[_-]?key\s*=|password\s*=|api[_-]?key\s*=)/i.test(value);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  failures.push(message);
}
