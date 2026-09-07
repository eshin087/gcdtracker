import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("CSV export safety", () => {
  it.each(["=1+1", "+cmd", "-cmd", "@SUM(1)", " \t=1", "\ttext", "\r=1", "\n@SUM(1)", "\u0000=1"])("neutralizes spreadsheet text %j", (value) => {
    const exported = toCsv([{ value }]);
    expect(exported.split("\n")[1]).toMatch(/^"?'/);
  });

  it("preserves real negative numbers, booleans and ordinary numeric strings", () => {
    expect(toCsv([{ number: -4, decimal: -0.5, yes: true, code: "123" }]))
      .toBe("number,decimal,yes,code\n-4,-0.5,true,123\n");
  });

  it("escapes delimiters and quotes and serializes dates/nulls/arrays", () => {
    expect(toCsv([{ text: 'a,"b"\nc', missing: null, date: new Date("2026-09-07T00:00:00Z"), list: ["a", "b"] }]))
      .toBe('text,missing,date,list\n"a,""b""\nc",,2026-09-07T00:00:00.000Z,a|b\n');
    expect(toCsv([{ list: ["=1", "b"] }])).toBe("list\n'=1|b\n");
  });

  it("guards column labels and produces a stable empty export", () => {
    expect(toCsv([], ["=bad", "safe"])).toBe("'=bad,safe\n");
    expect(toCsv([{ "=bad": "value" }])).toBe("'=bad\nvalue\n");
  });
});
