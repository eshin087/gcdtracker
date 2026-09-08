import { expect, it, vi } from "vitest";
vi.mock("./lib/hits", () => {throw new Error("Local analytics must not load");});
import proxy from "./proxy";
it("passes page requests through without loading a database or collecting visitor statistics", () => {
  expect(proxy().headers.get("x-middleware-next")).toBe("1");
});
