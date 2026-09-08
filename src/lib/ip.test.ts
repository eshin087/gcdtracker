import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalIp, clientIp, expandIPv6, hashSalt, ipHash, ipPrefix } from "./ip";

afterEach(() => vi.unstubAllEnvs());

describe("ip helpers", () => {
  it("reads the first x-forwarded-for entry", () => {
    const h = (n: string) => (n === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : null);
    expect(clientIp(h)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip and rejects garbage", () => {
    expect(clientIp((n) => (n === "x-real-ip" ? "2001:db8::1" : null))).toBe("2001:db8:0:0:0:0:0:1");
    expect(clientIp((n) => (n === "x-forwarded-for" ? "not-an-ip" : null))).toBeNull();
    expect(clientIp(() => null)).toBeNull();
  });

  it("expands IPv6", () => {
    expect(expandIPv6("2001:db8::1")).toEqual(["2001", "db8", "0", "0", "0", "0", "0", "1"]);
    expect(expandIPv6("::ffff:1.2.3.4")?.slice(5)).toEqual(["ffff", "102", "304"]);
    expect(expandIPv6("1.2.3.4")).toBeNull();
  });

  it("prefixes without leaking the full address", () => {
    expect(ipPrefix("203.0.113.9")).toBe("203.0.113.0/24");
    expect(ipPrefix("2001:db8:abcd:1234::99")).toBe("2001:db8:abcd::/48");
    expect(ipPrefix(null)).toBeNull();
    expect(ipPrefix("nope")).toBeNull();
  });

  it("hashes deterministically per salt", () => {
    const a = ipHash("203.0.113.9", "s1");
    expect(a).toHaveLength(16);
    expect(ipHash("203.0.113.9", "s1")).toBe(a);
    expect(ipHash("203.0.113.9", "s2")).not.toBe(a);
    expect(ipHash(null)).toBeNull();
  });
});

describe("canonical private identity", () => {
  it("uses one key for IPv6 variants and IPv4 mapped addresses", () => {
    const variants = ["2001:db8:abcd::1", "2001:0DB8:ABCD:0000:0:0:0:0001"];
    expect(canonicalIp(variants[0])).toBe(canonicalIp(variants[1]));
    expect(ipPrefix(variants[0])).toBe(ipPrefix(variants[1]));
    expect(ipHash(variants[0], "test")).toBe(ipHash(variants[1], "test"));
    expect(canonicalIp("::ffff:192.0.2.8")).toBe("192.0.2.8");
    expect(ipPrefix("::ffff:c000:0208")).toBe("192.0.2.0/24");
    expect(ipHash("::ffff:192.0.2.8", "test")).toBe(ipHash("192.0.2.8", "test"));
    expect(canonicalIp("fe80::1%eth0")).toBeNull();
  });
  it("disables hashes without a secret and supports a dedicated secret", () => {
    vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("IP_HASH_SECRET", "");
    expect(hashSalt()).toBeNull(); expect(ipHash("192.0.2.8")).toBeNull();
    vi.stubEnv("CRON_SECRET", "cron"); const a = ipHash("192.0.2.8"); expect(a).toHaveLength(16);
    vi.stubEnv("IP_HASH_SECRET", "dedicated"); expect(ipHash("192.0.2.8")).not.toBe(a);
    expect(ipHash("invalid", "test")).toBeNull();
  });
});
