/**
 * IP address classification for URL import safety.
 *
 * A URL import asks a server to fetch an arbitrary page. Without a guard, a
 * visitor could point it at loopback, LAN, or cloud-metadata addresses and use
 * the server as a proxy into the private network (SSRF). These helpers decide
 * whether a resolved address is safe to connect to.
 */

export interface IpVerdict {
  allowed: boolean;
  reason?: string;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = n * 256 + value;
  }
  return n >>> 0;
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

const IPV4_BLOCKED_RANGES: Array<{ base: number; bits: number; label: string }> = [
  { base: ipv4ToInt("0.0.0.0")!, bits: 8, label: "this network" },
  { base: ipv4ToInt("10.0.0.0")!, bits: 8, label: "private network" },
  { base: ipv4ToInt("100.64.0.0")!, bits: 10, label: "carrier-grade NAT" },
  { base: ipv4ToInt("127.0.0.0")!, bits: 8, label: "loopback" },
  { base: ipv4ToInt("169.254.0.0")!, bits: 16, label: "link-local / metadata" },
  { base: ipv4ToInt("172.16.0.0")!, bits: 12, label: "private network" },
  { base: ipv4ToInt("192.0.0.0")!, bits: 24, label: "IETF protocol assignments" },
  { base: ipv4ToInt("192.0.2.0")!, bits: 24, label: "documentation" },
  { base: ipv4ToInt("192.88.99.0")!, bits: 24, label: "6to4 relay anycast" },
  { base: ipv4ToInt("192.168.0.0")!, bits: 16, label: "private network" },
  { base: ipv4ToInt("198.18.0.0")!, bits: 15, label: "benchmarking" },
  { base: ipv4ToInt("198.51.100.0")!, bits: 24, label: "documentation" },
  { base: ipv4ToInt("203.0.113.0")!, bits: 24, label: "documentation" },
  { base: ipv4ToInt("224.0.0.0")!, bits: 4, label: "multicast" },
  { base: ipv4ToInt("240.0.0.0")!, bits: 4, label: "reserved" },
];

function classifyIpv4AsInt(n: number): IpVerdict {
  for (const range of IPV4_BLOCKED_RANGES) {
    const mask = range.bits === 0 ? 0 : (0xffffffff << (32 - range.bits)) >>> 0;
    if ((n & mask) >>> 0 === (range.base & mask) >>> 0) {
      return { allowed: false, reason: `Blocked IPv4 range (${range.label}): ${intToIpv4(n)}` };
    }
  }
  return { allowed: true };
}

/** Parse an IPv6 string into 16 bytes, or null when malformed. */
function parseIpv6(input: string): number[] | null {
  let text = input.trim().toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);

  // Embedded IPv4 tail (e.g. ::ffff:192.168.0.1)
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    if (lastColon < 0) return null;
    const v4 = ipv4ToInt(text.slice(lastColon + 1));
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon)}:${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const parts = text.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];

  let groups: string[];
  if (parts.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function isV4Mapped(bytes: number[]): boolean {
  return bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
}

/** Well-known NAT64 prefix 64:ff9b::/96 hides an IPv4 address in the last 4 bytes. */
function isNat64WellKnown(bytes: number[]): boolean {
  return (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0)
  );
}

function bytesToIpv4(bytes: number[]): number {
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

function hasPrefix(bytes: number[], prefix: number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  const remaining = bits % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (bytes[fullBytes] & mask) === (prefix[fullBytes] & mask);
}

const ZERO = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const IPV6_BLOCKED_PREFIXES: Array<{ prefix: number[]; bits: number; label: string }> = [
  { prefix: [0x00, 0x64, 0xff, 0x9b], bits: 96, label: "NAT64" },
  { prefix: [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], bits: 48, label: "NAT64 local-use" },
  { prefix: [0x01, 0x00], bits: 64, label: "discard-only" },
  { prefix: [0x20, 0x01, 0x00, 0x02], bits: 48, label: "benchmarking" },
  { prefix: [0x20, 0x01, 0x0d, 0xb8], bits: 32, label: "documentation" },
  { prefix: [0x20, 0x02], bits: 16, label: "6to4" },
  { prefix: [0x3f, 0xff], bits: 20, label: "documentation" },
];

function classifyIpv6(bytes: number[]): IpVerdict {
  if (isV4Mapped(bytes) || isNat64WellKnown(bytes)) {
    const v4 = bytesToIpv4(bytes.slice(12));
    return classifyIpv4AsInt(v4);
  }
  if (bytes.every((b) => b === 0)) {
    return { allowed: false, reason: "Blocked IPv6 range (unspecified address)" };
  }
  if (hasPrefix(bytes, ZERO, 128) || (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1)) {
    return { allowed: false, reason: "Blocked IPv6 range (loopback)" };
  }
  if ((bytes[0] & 0xfe) === 0xfc) {
    return { allowed: false, reason: "Blocked IPv6 range (unique local address)" };
  }
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return { allowed: false, reason: "Blocked IPv6 range (link-local)" };
  }
  if (bytes[0] === 0xff) {
    return { allowed: false, reason: "Blocked IPv6 range (multicast)" };
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return { allowed: false, reason: "Blocked IPv6 range (Teredo)" };
  }
  for (const entry of IPV6_BLOCKED_PREFIXES) {
    if (hasPrefix(bytes, entry.prefix, entry.bits)) {
      return { allowed: false, reason: `Blocked IPv6 range (${entry.label})` };
    }
  }
  return { allowed: true };
}

/**
 * Decide whether a literal IP address may be contacted for a URL import.
 * Private, loopback, link-local, multicast, reserved, and tunnelled-IPv4
 * ranges are rejected.
 */
export function classifyIp(ip: string): IpVerdict {
  const asV4 = ipv4ToInt(ip.trim());
  if (asV4 !== null) return classifyIpv4AsInt(asV4);

  const bytes = parseIpv6(ip.trim());
  if (!bytes) return { allowed: false, reason: `Unrecognised IP address: ${ip}` };
  return classifyIpv6(bytes);
}

export function isIpLiteral(host: string): boolean {
  const trimmed = host.trim().replace(/^\[|\]$/g, "");
  return ipv4ToInt(trimmed) !== null || parseIpv6(trimmed) !== null;
}
