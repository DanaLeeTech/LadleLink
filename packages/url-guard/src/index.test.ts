import { describe, expect, it } from "vitest";
import { assertUrlSafe, classifyIp, parseRecipeUrl, UnsafeUrlError } from "./index.js";

function expectCode(fn: () => unknown | Promise<unknown>, code: string) {
  return expect(fn()).rejects.toMatchObject({ name: "UnsafeUrlError", code });
}

describe("parseRecipeUrl", () => {
  it("accepts ordinary recipe links", () => {
    expect(parseRecipeUrl("https://example.com/recipes/cake").href).toBe(
      "https://example.com/recipes/cake"
    );
    expect(parseRecipeUrl("http://example.com:80/r").port).toBe("");
    expect(parseRecipeUrl("https://example.com:443/r").protocol).toBe("https:");
  });

  it("rejects non-http schemes", () => {
    expect(() => parseRecipeUrl("ftp://example.com/x")).toThrow(UnsafeUrlError);
    expect(() => parseRecipeUrl("javascript:alert(1)")).toThrow(UnsafeUrlError);
    expect(() => parseRecipeUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
  });

  it("rejects embedded credentials", () => {
    expect(() => parseRecipeUrl("https://user:pass@example.com/x")).toThrow(/credentials/i);
  });

  it("rejects disallowed ports", () => {
    expect(() => parseRecipeUrl("http://example.com:22/x")).toThrow(/port/i);
    expect(() => parseRecipeUrl("http://example.com:8080/x")).toThrow(/port/i);
  });

  it("rejects empty and oversized input", () => {
    expect(() => parseRecipeUrl("")).toThrow(UnsafeUrlError);
    expect(() => parseRecipeUrl(`https://example.com/${"a".repeat(4000)}`)).toThrow(/longer/i);
  });

  it("rejects internal hostnames", () => {
    expect(() => parseRecipeUrl("http://localhost/x")).toThrow(/not allowed/i);
    expect(() => parseRecipeUrl("http://printer.local/x")).toThrow(/not allowed/i);
  });
});

describe("classifyIp", () => {
  it("blocks IPv4 private, loopback, link-local, metadata, and reserved ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "240.0.0.1",
    ]) {
      expect(classifyIp(ip).allowed, ip).toBe(false);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.32.0.1", "192.169.0.1"]) {
      expect(classifyIp(ip).allowed, ip).toBe(true);
    }
  });

  it("blocks IPv6 loopback, link-local, unique-local, multicast, and docs ranges", () => {
    for (const ip of [
      "::",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "ff02::1",
      "2001:db8::1",
      "2002::1",
      "2001:0000::1",
    ]) {
      expect(classifyIp(ip).allowed, ip).toBe(false);
    }
  });

  it("handles IPv4-mapped and NAT64 addresses by their embedded IPv4", () => {
    expect(classifyIp("::ffff:127.0.0.1").allowed).toBe(false);
    expect(classifyIp("::ffff:192.168.0.10").allowed).toBe(false);
    expect(classifyIp("::ffff:8.8.8.8").allowed).toBe(true);
    expect(classifyIp("64:ff9b::a00:1").allowed).toBe(false);
    expect(classifyIp("2001:4860:4860::8888").allowed).toBe(true);
  });

  it("rejects unrecognised input", () => {
    expect(classifyIp("not-an-ip").allowed).toBe(false);
  });
});

describe("assertUrlSafe", () => {
  const resolveTo = (addresses: string[]) => async () => addresses;

  it("allows a hostname that resolves only to public addresses", async () => {
    const result = await assertUrlSafe("https://recipes.example.org/x", {
      resolve: resolveTo(["93.184.216.34"]),
    });
    expect(result.addresses).toEqual(["93.184.216.34"]);
  });

  it("blocks a hostname that resolves to a private address", async () => {
    await expectCode(
      () => assertUrlSafe("https://sneaky.example.org/x", { resolve: resolveTo(["127.0.0.1"]) }),
      "blocked-address"
    );
    await expectCode(
      () =>
        assertUrlSafe("https://mixed.example.org/x", {
          resolve: resolveTo(["93.184.216.34", "10.0.0.5"]),
        }),
      "blocked-address"
    );
  });

  it("blocks IP-literal URLs pointing at internal services", async () => {
    await expectCode(
      () => assertUrlSafe("http://169.254.169.254/latest/meta-data/"),
      "blocked-address"
    );
    await expectCode(() => assertUrlSafe("http://127.0.0.1:80/admin"), "blocked-address");
    await expectCode(() => assertUrlSafe("http://[::1]/admin"), "blocked-address");
  });

  it("blocks internal hostnames without resolving", async () => {
    await expectCode(() => assertUrlSafe("http://localhost/x"), "blocked-host");
    await expectCode(() => assertUrlSafe("http://router.home/x"), "blocked-host");
  });

  it("reports resolution failures", async () => {
    await expectCode(
      () =>
        assertUrlSafe("https://nope.example.org/x", {
          resolve: async () => {
            throw new Error("ENOTFOUND");
          },
        }),
      "resolution-failed"
    );
    await expectCode(
      () => assertUrlSafe("https://empty.example.org/x", { resolve: async () => [] }),
      "resolution-failed"
    );
  });
});
