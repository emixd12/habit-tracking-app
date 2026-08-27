export const HTTP_LIMITS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  maxRedirects: 3,
});

export function isPrivateHostname(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  return host === "::1" || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") || host.startsWith("fc") || host.startsWith("fd");
}

export function allowedUrl(origin, path) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || isPrivateHostname(base.hostname)) {
    throw new Error("Trust checks require a public HTTPS origin.");
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password) {
    throw new Error("Trust check URL escaped its allowlisted origin.");
  }
  return url;
}

export async function boundedFetch(origin, path, options = {}) {
  let url = allowedUrl(origin, path);
  const fetcher = options.fetcher ?? fetch;
  const limits = { ...HTTP_LIMITS, ...options.limits };
  for (let redirects = 0; redirects <= limits.maxRedirects; redirects += 1) {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(limits.timeoutMs),
      headers: { "user-agent": "Cadence-Public-Trust/1" },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (options.followRedirects === false) return { response, body: Buffer.alloc(0), finalUrl: url.toString(), redirects };
      url = allowedUrl(origin, new URL(response.headers.get("location"), url).toString());
      continue;
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > limits.maxBytes) throw new Error("Trust response exceeded the byte limit.");
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > limits.maxBytes) throw new Error("Trust response exceeded the byte limit.");
    return { response, body, finalUrl: url.toString(), redirects };
  }
  throw new Error("Trust response exceeded the redirect limit.");
}
