/**
 * URL import safety guard.
 *
 * Shared by the full app server and the public demo's import service. It makes
 * a server-side "fetch this recipe URL" request safe to expose:
 *
 *  - only http/https, no credentials, bounded length and ports
 *  - the hostname is resolved up front and every resolved address must be a
 *    public address (no loopback / LAN / link-local / metadata / reserved)
 *  - the validated address is pinned for the connection, closing the
 *    DNS-rebinding window between check and connect
 *  - redirects are followed manually, re-validating each hop
 *  - the body is capped in size, decoded, and must be HTML
 *  - optionally the fetched bytes are streamed through ClamAV in memory
 *
 * Nothing here writes to disk.
 */
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect, isIP, type LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { classifyIp, isIpLiteral } from "./ip.js";

export { classifyIp, isIpLiteral } from "./ip.js";

export const USER_AGENT =
  "LadleLink/0.1 (+local; user-initiated recipe import; not a crawler)";

export const DEFAULT_ALLOWED_PORTS = [80, 443];
export const DEFAULT_MAX_URL_LENGTH = 2048;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_TIMEOUT_MS = 10_000;

export type UnsafeUrlCode =
  | "invalid-url"
  | "unsupported-scheme"
  | "credentials-not-allowed"
  | "empty-host"
  | "url-too-long"
  | "port-not-allowed"
  | "blocked-host"
  | "resolution-failed"
  | "blocked-address"
  | "too-many-redirects"
  | "unexpected-content-type"
  | "response-too-large"
  | "timed-out"
  | "request-failed";

export class UnsafeUrlError extends Error {
  readonly code: UnsafeUrlCode;

  constructor(code: UnsafeUrlCode, message: string) {
    super(message);
    this.name = "UnsafeUrlError";
    this.code = code;
  }
}

export interface UrlGuardOptions {
  /** Ports that may be contacted. Defaults to 80 and 443. */
  allowedPorts?: number[];
  maxUrlLength?: number;
  /** Override DNS resolution (used by tests). */
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface SafeUrl {
  url: URL;
  addresses: string[];
}

export interface SafeFetchOptions extends UrlGuardOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

export interface SafeFetchResult {
  html: string;
  finalUrl: string;
  bytes: number;
  contentType: string;
}

export interface ClamAvOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
}

export interface ClamAvResult {
  clean: boolean;
  signature: string | null;
  raw: string;
}

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".home",
  ".test",
  ".example",
  ".invalid",
];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost") return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function defaultResolve(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses.map((entry) => entry.address));
    });
  });
}

/** Validate URL syntax, scheme, credentials, length, and port. Throws UnsafeUrlError. */
export function parseRecipeUrl(raw: string, options: UrlGuardOptions = {}): URL {
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  const maxUrlLength = options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new UnsafeUrlError("invalid-url", "A URL is required");
  }
  if (raw.length > maxUrlLength) {
    throw new UnsafeUrlError("url-too-long", `URL is longer than ${maxUrlLength} characters`);
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("invalid-url", "That does not look like a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("unsupported-scheme", "Only http and https links are supported");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials-not-allowed", "Links with embedded credentials are not allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) {
    throw new UnsafeUrlError("empty-host", "The link is missing a hostname");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeUrlError("blocked-host", `Host is not allowed: ${url.hostname}`);
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.includes(port)) {
    throw new UnsafeUrlError("port-not-allowed", `Port ${port} is not allowed`);
  }
  return url;
}

/**
 * Validate the URL and every address its host resolves to. Any address in a
 * private, loopback, link-local, metadata, or reserved range rejects the URL.
 */
export async function assertUrlSafe(raw: string, options: UrlGuardOptions = {}): Promise<SafeUrl> {
  const url = parseRecipeUrl(raw, options);
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: string[];
  if (isIpLiteral(host)) {
    addresses = [host];
  } else {
    const resolve = options.resolve ?? defaultResolve;
    try {
      addresses = await resolve(host);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new UnsafeUrlError("resolution-failed", `Could not resolve ${host}: ${reason}`);
    }
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError("resolution-failed", `Could not resolve ${host}`);
  }
  for (const address of addresses) {
    const verdict = classifyIp(address);
    if (!verdict.allowed) {
      throw new UnsafeUrlError(
        "blocked-address",
        `Refusing to fetch ${host}: ${verdict.reason ?? "blocked address"}`
      );
    }
  }
  return { url, addresses };
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function decodeBody(message: IncomingMessage, raw: Buffer): Buffer {
  const encoding = String(message.headers["content-encoding"] ?? "").toLowerCase();
  try {
    if (encoding.includes("gzip")) return gunzipSync(raw);
    if (encoding.includes("deflate")) return inflateSync(raw);
    if (encoding.includes("br")) return brotliDecompressSync(raw);
  } catch {
    // fall through: return the raw bytes if decompression fails
  }
  return raw;
}

interface RawResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
}

function requestOnce(
  url: URL,
  pinnedAddress: string,
  options: Required<Pick<SafeFetchOptions, "timeoutMs" | "maxBytes" | "userAgent">>
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const family = isIP(pinnedAddress) === 6 ? 6 : 4;

    // Pin the connection to the address we already validated. Node may ask for
    // either a single address or (with autoSelectFamily) a list, so answer both.
    const pinnedLookup = (
      _hostname: string,
      lookupOptions: { all?: boolean },
      callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void
    ) => {
      if (lookupOptions && lookupOptions.all) {
        callback(null, [{ address: pinnedAddress, family }]);
      } else {
        callback(null, pinnedAddress, family);
      }
    };

    let settled = false;
    const fail = (code: UnsafeUrlCode, message: string) => {
      if (settled) return;
      settled = true;
      reject(new UnsafeUrlError(code, message));
    };

    let request;
    try {
      request = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: {
            "User-Agent": options.userAgent,
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
          },
          lookup: pinnedLookup as unknown as LookupFunction,
          servername: isHttps ? url.hostname : undefined,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location ?? null;
          const contentType = String(response.headers["content-type"] ?? "");

          if (isRedirectStatus(status)) {
            response.resume();
            if (settled) return;
            settled = true;
            resolve({ status, location, contentType, body: Buffer.alloc(0) });
            return;
          }

          const chunks: Buffer[] = [];
          let total = 0;
          response.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > options.maxBytes) {
              response.destroy();
              fail("response-too-large", `The page is larger than ${options.maxBytes} bytes`);
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (settled) return;
            settled = true;
            resolve({
              status,
              location,
              contentType,
              body: decodeBody(response, Buffer.concat(chunks)),
            });
          });
          response.on("error", (err: Error) => fail("request-failed", err.message));
        }
      );
    } catch (err) {
      fail("request-failed", err instanceof Error ? err.message : String(err));
      return;
    }

    request.setTimeout(options.timeoutMs, () => {
      request.destroy();
      fail("timed-out", `The page took longer than ${options.timeoutMs}ms to respond`);
    });
    request.on("error", (err: Error) => fail("request-failed", err.message));
    request.end();
  });
}

function isHtmlContentType(contentType: string): boolean {
  const value = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return value === "text/html" || value === "application/xhtml+xml";
}

/**
 * Fetch a page with the full safety guard applied. Returns the decoded HTML and
 * the final URL after redirects. Throws UnsafeUrlError when anything is unsafe.
 */
export async function fetchHtmlSafely(
  raw: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const settings = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    userAgent: options.userAgent ?? USER_AGENT,
  };

  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const { url, addresses } = await assertUrlSafe(current, options);
    const response = await requestOnce(url, addresses[0], settings);

    if (isRedirectStatus(response.status)) {
      if (!response.location) {
        throw new UnsafeUrlError("request-failed", `HTTP ${response.status} without a Location header`);
      }
      const next = new URL(response.location, url);
      current = next.href;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new UnsafeUrlError("request-failed", `Failed to fetch recipe page: HTTP ${response.status}`);
    }
    if (!isHtmlContentType(response.contentType)) {
      throw new UnsafeUrlError(
        "unexpected-content-type",
        `That link did not return a web page (${response.contentType || "unknown content type"})`
      );
    }
    const html = response.body.toString("utf8");
    return {
      html,
      finalUrl: url.href,
      bytes: response.body.length,
      contentType: response.contentType,
    };
  }
  throw new UnsafeUrlError("too-many-redirects", `That link redirected more than ${maxRedirects} times`);
}

const CLAMAV_CHUNK_SIZE = 64 * 1024;

/**
 * Stream a buffer through a running ClamAV daemon (clamd) using INSTREAM and
 * report whether it looks clean. No data is written to disk on either side.
 */
export function scanWithClamAv(
  data: Buffer | string,
  options: ClamAvOptions
): Promise<ClamAvResult> {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const port = options.port ?? 3310;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return new Promise((resolve, reject) => {
    const socket = connect({ host: options.host, port });
    let reply = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      socket.destroy();
      finish(() => reject(new Error("ClamAV scan timed out")));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < payload.length; offset += CLAMAV_CHUNK_SIZE) {
        const chunk = payload.subarray(offset, offset + CLAMAV_CHUNK_SIZE);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.from([0, 0, 0, 0]));
    });

    socket.on("data", (chunk: Buffer) => {
      reply += chunk.toString("utf8");
    });

    socket.on("end", () => {
      const raw = reply.replace(/\0/g, "").trim();
      const found = raw.includes("FOUND");
      finish(() =>
        resolve({
          clean: !found && raw.endsWith("OK"),
          signature: found ? raw.replace(/^stream:\s*/, "").replace(/\s*FOUND.*$/, "") : null,
          raw,
        })
      );
    });

    socket.on("error", (err: Error) => finish(() => reject(err)));
  });
}
