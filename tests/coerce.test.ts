import { describe, expect, it } from "vitest";
import { coerceValue } from "../src/schema/coerce.js";
import { t } from "../src/schema/types.js";

describe("coerceValue — number", () => {
  it('coerces "9.5" string to 9.5', () => {
    expect(coerceValue("9.5", t.number().coerce())).toBe(9.5);
  });

  it("passes through a number unchanged", () => {
    expect(coerceValue(42, t.number().coerce())).toBe(42);
  });

  it('coerces "5 minutes" to 5', () => {
    expect(coerceValue("5 minutes", t.number().coerce())).toBe(5);
  });

  it('coerces "1,200" to 1200', () => {
    expect(coerceValue("1,200", t.number().coerce())).toBe(1200);
  });

  it("does NOT coerce when .coerce() is not called", () => {
    expect(coerceValue("9.5", t.number())).toBe("9.5");
  });

  it('coerces true → 1', () => {
    expect(coerceValue(true, t.number().coerce())).toBe(1);
  });
});

describe("coerceValue — boolean", () => {
  it('coerces "yes" to true', () => {
    expect(coerceValue("yes", t.boolean().coerce())).toBe(true);
  });

  it('coerces "true" to true', () => {
    expect(coerceValue("true", t.boolean().coerce())).toBe(true);
  });

  it('coerces "no" to false', () => {
    expect(coerceValue("no", t.boolean().coerce())).toBe(false);
  });

  it('coerces "false" to false', () => {
    expect(coerceValue("false", t.boolean().coerce())).toBe(false);
  });

  it('coerces "TRUE" (case-insensitive) to true', () => {
    expect(coerceValue("TRUE", t.boolean().coerce())).toBe(true);
  });

  it("passes through a real boolean", () => {
    expect(coerceValue(false, t.boolean().coerce())).toBe(false);
  });
});

describe("coerceValue — array", () => {
  it('coerces "tag1, tag2" to ["tag1", "tag2"]', () => {
    expect(coerceValue("tag1, tag2", t.array(t.string()).coerce())).toEqual(["tag1", "tag2"]);
  });

  it("passes through a real array", () => {
    expect(coerceValue(["a", "b"], t.array(t.string()).coerce())).toEqual(["a", "b"]);
  });

  it("wraps a single non-string value in an array", () => {
    expect(coerceValue(42, t.array(t.number()).coerce())).toEqual([42]);
  });

  it("coerces items in the array when item field has .coerce()", () => {
    const field = t.array(t.number().coerce());
    expect(coerceValue(["1", "2.5"], field)).toEqual([1, 2.5]);
  });
});

describe("coerceValue — union", () => {
  it("normalizes casing for union members", () => {
    const field = t.union(["positive", "negative", "neutral"] as const).coerce();
    expect(coerceValue("Positive", field)).toBe("positive");
  });

  it("passes through a valid member unchanged", () => {
    const field = t.union(["positive", "negative"] as const).coerce();
    expect(coerceValue("negative", field)).toBe("negative");
  });
});

describe("coerceValue — optional", () => {
  it("returns undefined for null/undefined/empty string", () => {
    const field = t.optional(t.number().coerce());
    expect(coerceValue(null, field)).toBeUndefined();
    expect(coerceValue(undefined, field)).toBeUndefined();
    expect(coerceValue("", field)).toBeUndefined();
  });

  it("coerces inner field when value is present", () => {
    const field = t.optional(t.number().coerce());
    expect(coerceValue("7.5", field)).toBe(7.5);
  });
});
