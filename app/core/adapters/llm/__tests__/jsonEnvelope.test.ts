import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../jsonEnvelope";

describe("extractJsonObject", () => {
  it("parses a plain JSON object", () => {
    expect(extractJsonObject('{"k":1}')).toEqual({ k: 1 });
  });

  it("recovers an object preceded by prose", () => {
    expect(extractJsonObject('Sure: {"k":1}')).toEqual({ k: 1 });
  });

  it("strips a ```json fenced block", () => {
    expect(extractJsonObject('```json\n{"k":1}\n```')).toEqual({ k: 1 });
  });

  it("strips a plain ``` fenced block", () => {
    expect(extractJsonObject('```\n{"k":1}\n```')).toEqual({ k: 1 });
  });

  it("strips a ~~~ fenced block", () => {
    expect(extractJsonObject('~~~\n{"k":1}\n~~~')).toEqual({ k: 1 });
  });

  it("parses an indented object", () => {
    expect(extractJsonObject('    {"k":1}')).toEqual({ k: 1 });
  });

  it("does not treat a } inside a string literal as the closing brace", () => {
    expect(extractJsonObject('{"k":"contains } brace"}')).toEqual({
      k: "contains } brace",
    });
  });

  it("handles escaped quotes and backslashes inside string literals", () => {
    expect(
      extractJsonObject('{"k":"with \\"quote\\" and \\\\backslash"}'),
    ).toEqual({ k: 'with "quote" and \\backslash' });
  });

  it("handles unicode escapes inside string literals", () => {
    expect(extractJsonObject('{"k":"\\u00ff"}')).toEqual({ k: "ÿ" });
  });

  it("recovers the head object when the envelope is wrapped in an array", () => {
    expect(extractJsonObject('[{"k":1}]')).toEqual({ k: 1 });
  });

  it("returns null for a string-only array (no object envelope)", () => {
    expect(extractJsonObject('["a","b"]')).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(extractJsonObject("[]")).toBeNull();
  });

  it("returns null for non-JSON prose", () => {
    expect(extractJsonObject("hello world")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(extractJsonObject("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(extractJsonObject("   \n\t ")).toBeNull();
  });

  it("recovers an object preceded by prose and followed by trailing text", () => {
    expect(extractJsonObject('Here: {"k":1} done.')).toEqual({ k: 1 });
  });

  it("recovers an object with nested objects and arrays", () => {
    expect(extractJsonObject('{"a":{"b":[1,2,3]},"c":"x"}')).toEqual({
      a: { b: [1, 2, 3] },
      c: "x",
    });
  });

  it("skips a leading prose pseudo-brace pair and recovers the real envelope", () => {
    expect(extractJsonObject('Greeting {John}, here: {"k":1}')).toEqual({
      k: 1,
    });
  });

  it("returns null when every brace candidate fails to parse", () => {
    expect(extractJsonObject("noise {bad}{also bad} trail")).toBeNull();
  });
});
