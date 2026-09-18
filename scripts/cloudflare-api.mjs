#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const envLocalPath = resolve(root, ".env.local");
const apiBaseUrl = "https://api.cloudflare.com/client/v4";

const parseEnvFile = (content) => {
  const values = new Map();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const name = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(name, value);
  }

  return values;
};

const envLocalValues = existsSync(envLocalPath)
  ? parseEnvFile(readFileSync(envLocalPath, "utf8"))
  : new Map();

const envSource = (name) => {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return { value: process.env[name], source: "process.env" };
  }
  if (envLocalValues.has(name)) {
    return { value: envLocalValues.get(name), source: ".env.local" };
  }
  return { value: undefined, source: "missing" };
};

const envValue = (name) => envSource(name).value;
const hasValue = (value) => value !== undefined && String(value).trim() !== "";
const clean = (value) => String(value || "").trim();

const args = process.argv.slice(2);
const purchasePattern = /registration|purchase|buy|domain-search|domain-check/i;

const usage = `Usage: node scripts/cloudflare-api.mjs <command> [...options]

Env:
  CLOUDFLARE_API_TOKEN   user-owned scoped API token
  CLOUDFLARE_ACCOUNT_ID  management account id
  CLOUDFLARE_ZONE_NAME   bound zone name, e.g. example.com
  CLOUDFLARE_ZONE_ID     optional bound zone id

Read tier:
  verify
  zones list
  zone info
  dns list
  registrar list
  registrar get <domain>

DNS-edit tier:
  dns create --type A --name sub.example.com --content 1.2.3.4 [--ttl 1] [--proxied true|false]
  dns update --id <record_id> [--type ...] [--name ...] [--content ...] [--ttl ...] [--proxied true|false]
  dns delete --id <record_id>

Zone-admin tier:
  zone create <domain> --confirm
  zone delete --confirm-zone <exact-zone-name>
  registrar update <domain> [--auto-renew true|false] [--locked true|false] [--privacy true|false] --confirm`;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const printUsage = () => {
  console.log(usage);
};

if ([args[0], args[1]].some((arg) => arg && purchasePattern.test(arg))) {
  fail("domain registration/purchase is dashboard-only by policy (non-refundable, billing-sensitive).");
}

if (args.length === 0 || args.some((arg) => ["--help", "-h", "help"].includes(arg))) {
  printUsage();
  process.exit(0);
}

const parseFlags = (argv) => {
  const flags = new Map();
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    if (equalsIndex !== -1) {
      flags.set(arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1));
      continue;
    }

    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }

  return { flags, positionals };
};

const flagValue = (flags, name) => flags.get(name);

const requireFlagValue = (flags, name) => {
  const value = flagValue(flags, name);
  if (value === undefined || value === true || clean(value) === "") {
    fail(`Missing --${name}.`);
  }
  return clean(value);
};

const optionalBoolean = (flags, name, fallback) => {
  const value = flagValue(flags, name);
  if (value === undefined) return fallback;
  if (value === true) fail(`--${name} expects true or false.`);
  const normalized = clean(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  fail(`--${name} expects true or false.`);
};

const optionalInteger = (flags, name, fallback) => {
  const value = flagValue(flags, name);
  if (value === undefined) return fallback;
  if (value === true) fail(`--${name} expects a number.`);
  const parsed = Number.parseInt(clean(value), 10);
  if (!Number.isInteger(parsed) || String(parsed) !== clean(value)) {
    fail(`--${name} expects a number.`);
  }
  return parsed;
};

const requireToken = () => {
  const token = envValue("CLOUDFLARE_API_TOKEN");
  if (!hasValue(token)) {
    fail("Missing CLOUDFLARE_API_TOKEN. Stage it in .env.local or process env; the wrapper only reports presence.");
  }
  return clean(token);
};

const requireAccountId = () => {
  const accountId = envValue("CLOUDFLARE_ACCOUNT_ID");
  if (!hasValue(accountId)) {
    fail("Missing CLOUDFLARE_ACCOUNT_ID. Stage the Cloudflare account id in .env.local or process env.");
  }
  return clean(accountId);
};

const optionalZoneId = () => {
  const zoneId = envValue("CLOUDFLARE_ZONE_ID");
  return hasValue(zoneId) ? clean(zoneId) : null;
};

const optionalZoneName = () => {
  const zoneName = envValue("CLOUDFLARE_ZONE_NAME");
  return hasValue(zoneName) ? clean(zoneName) : null;
};

const normalizeDomain = (value) => clean(value).replace(/\.$/, "").toLowerCase();

const isWithinZone = (name, zoneName) => {
  const normalizedName = normalizeDomain(name);
  const normalizedZone = normalizeDomain(zoneName);
  return normalizedName === normalizedZone || normalizedName.endsWith(`.${normalizedZone}`);
};

const guardRecordName = (recordName) => {
  const zoneName = optionalZoneName();
  if (!zoneName) {
    fail("Refusing DNS mutation: CLOUDFLARE_ZONE_NAME is required so writes are bound to one explicit zone.");
  }
  if (!isWithinZone(recordName, zoneName)) {
    fail(`Refusing DNS mutation: record name '${clean(recordName)}' is outside the bound zone '${zoneName}'. Set CLOUDFLARE_ZONE_NAME to the intended zone or choose a name within it.`);
  }
};

const apiFailure = (status, payload) => {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length > 0) {
    console.error(`Cloudflare API request failed (HTTP ${status}).`);
    for (const error of errors) {
      const code = error?.code === undefined ? "unknown" : String(error.code);
      const message = error?.message === undefined ? "No message provided." : String(error.message);
      console.error(`- ${code}: ${message}`);
    }
    return;
  }
  console.error(`Cloudflare API request failed (HTTP ${status}).`);
};

const apiRequest = async (method, path, options = {}) => {
  const token = requireToken();
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    fail(`Cloudflare API request failed before a response: ${error.message}`);
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok || payload?.success === false) {
    apiFailure(response.status, payload);
    process.exit(1);
  }

  return {
    result: payload && Object.prototype.hasOwnProperty.call(payload, "result") ? payload.result : payload,
    resultInfo: payload?.result_info || null,
  };
};

const listAll = async (basePath) => {
  const perPage = 50;
  const items = [];
  let page = 1;
  let lastInfo = null;

  while (true) {
    const separator = basePath.includes("?") ? "&" : "?";
    const { result, resultInfo } = await apiRequest("GET", `${basePath}${separator}per_page=${perPage}&page=${page}`);
    if (Array.isArray(result)) items.push(...result);
    lastInfo = resultInfo;

    const totalPages = Number(resultInfo?.total_pages || 0);
    if (!totalPages || page >= totalPages) break;
    page += 1;
  }

  return { items, resultInfo: lastInfo };
};

const zonesPath = (name) => {
  const accountId = requireAccountId();
  let path = `/zones?account.id=${encodeURIComponent(accountId)}`;
  if (name) path += `&name=${encodeURIComponent(name)}`;
  return path;
};

const findZoneByName = async (zoneName) => {
  const normalized = normalizeDomain(zoneName);
  const { items } = await listAll(zonesPath(normalized));
  return items.find((zone) => normalizeDomain(zone?.name) === normalized) || null;
};

const resolveBoundZone = async () => {
  const zoneId = optionalZoneId();
  const zoneName = optionalZoneName();

  if (zoneName) {
    const zone = await findZoneByName(zoneName);
    if (!zone) fail(`Bound zone '${zoneName}' was not found in CLOUDFLARE_ACCOUNT_ID.`);
    if (zoneId && clean(zone.id) !== zoneId) {
      fail(`Bound zone mismatch: CLOUDFLARE_ZONE_ID does not match CLOUDFLARE_ZONE_NAME '${zoneName}'.`);
    }
    return zone;
  }

  if (zoneId) {
    const { items } = await listAll(zonesPath(null));
    const zone = items.find((candidate) => clean(candidate?.id) === zoneId);
    if (!zone) fail("Bound zone id was not found in CLOUDFLARE_ACCOUNT_ID.");
    return zone;
  }

  fail("Missing Cloudflare zone binding. Stage CLOUDFLARE_ZONE_NAME or CLOUDFLARE_ZONE_ID.");
};

const resolveBoundZoneId = async () => {
  const zone = await resolveBoundZone();
  return clean(zone.id);
};

const truncate = (value) => {
  const text = String(value ?? "");
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

const printZone = (zone) => {
  const nameServers = Array.isArray(zone?.name_servers) ? zone.name_servers.join(", ") : "";
  console.log(`name: ${zone?.name || ""}`);
  console.log(`id: ${zone?.id || ""}`);
  console.log(`status: ${zone?.status || ""}`);
  console.log(`name_servers: ${nameServers}`);
};

const printDnsRecord = (record) => {
  console.log(`${record?.id || ""}\t${record?.type || ""}\t${record?.name || ""}\t${truncate(record?.content)}\tttl=${record?.ttl ?? ""}\tproxied=${record?.proxied ?? false}`);
};

const registrarDomainName = (domain) => domain?.name || domain?.domain_name || domain?.domain || "";

const printRegistrarDomain = (domain) => {
  const name = registrarDomainName(domain);
  const expires = domain?.expires_at || domain?.expiration_date || domain?.expires_on || domain?.expiry || "";
  const autoRenew = domain?.auto_renew ?? domain?.autoRenew ?? "";
  const locked = domain?.locked ?? "";
  const privacy = domain?.privacy ?? domain?.privacy_protection ?? "";
  console.log(`${name}\texpires=${expires}\tauto_renew=${autoRenew}\tlocked=${locked}\tprivacy=${privacy}`);
};

const listRegistrarDomains = async () => {
  const accountId = requireAccountId();
  const { result } = await apiRequest("GET", `/accounts/${encodeURIComponent(accountId)}/registrar/domains`);
  return Array.isArray(result) ? result : [];
};

const commandVerify = async () => {
  const tokenInfo = envSource("CLOUDFLARE_API_TOKEN");
  if (!hasValue(tokenInfo.value)) {
    fail("Missing CLOUDFLARE_API_TOKEN. Stage it in .env.local or process env; the wrapper only reports presence.");
  }
  const { result } = await apiRequest("GET", "/user/tokens/verify");
  console.log(`Cloudflare token status: ${result?.status || "unknown"}`);
  console.log(`Cloudflare token id: ${result?.id || "unknown"}`);
  console.log(`CLOUDFLARE_API_TOKEN source: ${tokenInfo.source}`);
};

const commandZonesList = async () => {
  const { items, resultInfo } = await listAll(zonesPath(null));
  if (items.length === 0) {
    console.log("No zones found.");
    return;
  }
  for (const zone of items) {
    printZone(zone);
    console.log("");
  }
  if (resultInfo?.total_count !== undefined) {
    console.log(`total_count: ${resultInfo.total_count}`);
  }
};

const commandZoneInfo = async () => {
  const zone = await resolveBoundZone();
  printZone(zone);
};

const commandDnsList = async () => {
  const zoneId = await resolveBoundZoneId();
  const { items } = await listAll(`/zones/${encodeURIComponent(zoneId)}/dns_records`);
  if (items.length === 0) {
    console.log("No DNS records found.");
    return;
  }
  for (const record of items) printDnsRecord(record);
};

const commandDnsCreate = async (argv) => {
  const { flags } = parseFlags(argv);
  const type = requireFlagValue(flags, "type");
  const name = requireFlagValue(flags, "name");
  const content = requireFlagValue(flags, "content");
  guardRecordName(name);

  const body = {
    type,
    name,
    content,
    ttl: optionalInteger(flags, "ttl", 1),
    proxied: optionalBoolean(flags, "proxied", false),
  };

  const zoneId = await resolveBoundZoneId();
  const { result } = await apiRequest("POST", `/zones/${encodeURIComponent(zoneId)}/dns_records`, { body });
  console.log("Created DNS record:");
  printDnsRecord(result);
};

const commandDnsUpdate = async (argv) => {
  const { flags } = parseFlags(argv);
  const recordId = requireFlagValue(flags, "id");
  const body = {};

  if (flags.has("type")) body.type = requireFlagValue(flags, "type");
  if (flags.has("name")) {
    body.name = requireFlagValue(flags, "name");
    guardRecordName(body.name);
  }
  if (flags.has("content")) body.content = requireFlagValue(flags, "content");
  if (flags.has("ttl")) body.ttl = optionalInteger(flags, "ttl", undefined);
  if (flags.has("proxied")) body.proxied = optionalBoolean(flags, "proxied", undefined);

  if (Object.keys(body).length === 0) {
    fail("dns update needs at least one field to change.");
  }

  const zoneId = await resolveBoundZoneId();
  const { result } = await apiRequest("PATCH", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`, { body });
  console.log("Updated DNS record:");
  printDnsRecord(result);
};

const commandDnsDelete = async (argv) => {
  const { flags } = parseFlags(argv);
  const recordId = requireFlagValue(flags, "id");
  const zoneId = await resolveBoundZoneId();
  await apiRequest("DELETE", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`);
  console.log(`Deleted DNS record ${recordId} from the bound zone.`);
};

const commandRegistrarList = async () => {
  const domains = await listRegistrarDomains();
  if (domains.length === 0) {
    console.log("No Cloudflare Registrar domains found.");
    return;
  }
  for (const domain of domains) printRegistrarDomain(domain);
};

const commandRegistrarGet = async (domain) => {
  if (!domain) fail("registrar get needs <domain>.");
  const accountId = requireAccountId();
  const { result } = await apiRequest("GET", `/accounts/${encodeURIComponent(accountId)}/registrar/domains/${encodeURIComponent(domain)}`);
  printRegistrarDomain(result);
};

const commandRegistrarUpdate = async (argv) => {
  const { flags, positionals } = parseFlags(argv);
  const domain = positionals[0];
  if (!domain) fail("registrar update needs <domain>.");
  if (!flags.has("confirm")) {
    fail("Refusing registrar update without --confirm.");
  }

  const body = {};
  if (flags.has("auto-renew")) body.auto_renew = optionalBoolean(flags, "auto-renew", undefined);
  if (flags.has("locked")) body.locked = optionalBoolean(flags, "locked", undefined);
  if (flags.has("privacy")) body.privacy = optionalBoolean(flags, "privacy", undefined);
  if (Object.keys(body).length === 0) {
    fail("registrar update needs at least one of --auto-renew, --locked, or --privacy.");
  }

  const domains = await listRegistrarDomains();
  const normalizedDomain = normalizeDomain(domain);
  const owned = domains.some((entry) => normalizeDomain(registrarDomainName(entry)) === normalizedDomain);
  if (!owned) {
    fail(`Refusing registrar update: '${domain}' is not in this account's Cloudflare Registrar domain list.`);
  }

  const accountId = requireAccountId();
  const { result } = await apiRequest("PUT", `/accounts/${encodeURIComponent(accountId)}/registrar/domains/${encodeURIComponent(domain)}`, { body });
  console.log("Updated registrar settings:");
  printRegistrarDomain(result);
};

const commandZoneCreate = async (argv) => {
  const { flags, positionals } = parseFlags(argv);
  const domain = positionals[0];
  if (!domain) fail("zone create needs <domain>.");
  if (!flags.has("confirm")) {
    fail("Refusing zone create without --confirm.");
  }

  const accountId = requireAccountId();
  const body = {
    account: { id: accountId },
    name: domain,
    type: "full",
  };

  const { result } = await apiRequest("POST", "/zones", { body });
  console.log("Created zone:");
  printZone(result);
};

const commandZoneDelete = async (argv) => {
  const { flags } = parseFlags(argv);
  const zoneName = requireFlagValue(flags, "confirm-zone");
  const zone = await findZoneByName(zoneName);
  if (!zone) fail(`Zone '${zoneName}' was not found in CLOUDFLARE_ACCOUNT_ID.`);
  if (clean(zone?.name) !== zoneName) {
    fail("Refusing zone delete: --confirm-zone must match the exact zone name.");
  }
  await apiRequest("DELETE", `/zones/${encodeURIComponent(zone.id)}`);
  console.log(`Deleted zone ${zoneName}.`);
};

const main = async () => {
  const [command, subcommand, ...rest] = args;

  if (command === "verify") {
    await commandVerify();
    return;
  }

  if (command === "zones" && subcommand === "list") {
    await commandZonesList();
    return;
  }

  if (command === "zone" && subcommand === "info") {
    await commandZoneInfo();
    return;
  }

  if (command === "zone" && subcommand === "create") {
    await commandZoneCreate(rest);
    return;
  }

  if (command === "zone" && subcommand === "delete") {
    await commandZoneDelete(rest);
    return;
  }

  if (command === "dns" && subcommand === "list") {
    await commandDnsList();
    return;
  }

  if (command === "dns" && subcommand === "create") {
    await commandDnsCreate(rest);
    return;
  }

  if (command === "dns" && subcommand === "update") {
    await commandDnsUpdate(rest);
    return;
  }

  if (command === "dns" && subcommand === "delete") {
    await commandDnsDelete(rest);
    return;
  }

  if (command === "registrar" && subcommand === "list") {
    await commandRegistrarList();
    return;
  }

  if (command === "registrar" && subcommand === "get") {
    await commandRegistrarGet(rest[0]);
    return;
  }

  if (command === "registrar" && subcommand === "update") {
    await commandRegistrarUpdate(rest);
    return;
  }

  printUsage();
  process.exit(1);
};

await main();
