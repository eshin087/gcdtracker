import { describe, expect, it } from "vitest";
import { clientIp, expandIPv6, ipHash, ipPrefix } from "./ip";

describe("ip helpers", () => {
  it("reads the first x-forwarded-for entry", () => {
    const h = (n: string) => (n === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : null);
    expect(clientIp(h)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip and rejects garbage", () => {
    expect(clientIp((n) => (n === "x-real-ip" ? "2001:db8::1" : null))).toBe("2001:db8::1");
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
