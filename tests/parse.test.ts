import { describe, expect, it } from "vitest";
import { defineOutput } from "../src/schema/define.js";
import { t } from "../src/schema/types.js";
import { parse } from "../src/parse/parse.js";
import { parsePartial } from "../src/parse/partial.js";
import { buildPrompt } from "../src/prompt/build.js";

// ---------------------------------------------------------------------------
// Shared schema fixture
// ---------------------------------------------------------------------------

const ArticleSchema = defineOutput({
  title: t.string(),
  sentiment: t.union(["positive", "negative", "neutral"] as const),
  keyPoints: t.array(t.string()),
  readingTimeMinutes: t.number().coerce(),
});

// ---------------------------------------------------------------------------
// parse() — happy path
// ---------------------------------------------------------------------------

describe("parse() — happy path", () => {
  it("parses a perfectly valid JSON response", () => {
    const raw = JSON.stringify({
      title: "Hello World",
      sentiment: "positive",
      keyPoints: ["point 1", "point 2"],
      readingTimeMinutes: 3,
    });
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Hello World");
      expect(result.data.sentiment).toBe("positive");
      expect(result.data.keyPoints).toEqual(["point 1", "point 2"]);
      expect(result.data.readingTimeMinutes).toBe(3);
    }
  });

  it("strips markdown fences around JSON", () => {
    const raw = "```json\n" + JSON.stringify({ title: "T", sentiment: "neutral", keyPoints: [], readingTimeMinutes: 1 }) + "\n```";
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(true);
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const raw = `Here is the answer: {"title":"T","sentiment":"neutral","keyPoints":[],"readingTimeMinutes":1} — done.`;
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parse() — coercion
// ---------------------------------------------------------------------------

describe("parse() — coercion", () => {
  it('coerces "3 minutes" → 3 for readingTimeMinutes', () => {
    const raw = JSON.stringify({
      title: "T",
      sentiment: "neutral",
      keyPoints: [],
      readingTimeMinutes: "3 minutes",
    });
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.readingTimeMinutes).toBe(3);
  });

  it('coerces "9.5" → 9.5 for readingTimeMinutes', () => {
    const raw = JSON.stringify({ title: "T", sentiment: "neutral", keyPoints: [], readingTimeMinutes: "9.5" });
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.readingTimeMinutes).toBe(9.5);
  });
});

// ---------------------------------------------------------------------------
// parse() — validation errors
// ---------------------------------------------------------------------------

describe("parse() — validation errors", () => {
  it("returns field errors for wrong types", () => {
    const raw = JSON.stringify({
      title: 123,
      sentiment: "maybe",
      keyPoints: "not-an-array",
      readingTimeMinutes: "not-a-number-at-all",
    });
    const result = parse(raw, ArticleSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.code).toBe("VALIDATION_FAILED");
      const paths = result.errors.fieldErrors.map((e) => e.path);
      expect(paths).toContain("title");
      expect(paths).toContain("sentiment");
      expect(paths).toContain("keyPoints");
      expect(paths).toContain("readingTimeMinutes");
    }
  });

  it("returns MISSING_JSON for empty input", () => {
    const result = parse("", ArticleSchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.code).toBe("MISSING_JSON");
  });

  it("returns INVALID_JSON for non-object JSON", () => {
    const result = parse("[1,2,3]", ArticleSchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.code).toBe("INVALID_JSON");
  });
});

// ---------------------------------------------------------------------------
// parse() — optional fields
// ---------------------------------------------------------------------------

describe("parse() — optional fields", () => {
  const SchemaWithOptional = defineOutput({
    title: t.string(),
    subtitle: t.optional(t.string()),
  });

  it("accepts absent optional fields", () => {
    const result = parse(JSON.stringify({ title: "T" }), SchemaWithOptional);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtitle).toBeUndefined();
  });

  it("accepts null optional fields", () => {
    const result = parse(JSON.stringify({ title: "T", subtitle: null }), SchemaWithOptional);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parsePartial()
// ---------------------------------------------------------------------------

describe("parsePartial()", () => {
  it("parses a complete object correctly", () => {
    const raw = JSON.stringify({
      title: "T", sentiment: "positive", keyPoints: ["a"], readingTimeMinutes: 2,
    });
    const result = parsePartial(raw, ArticleSchema);
    expect(result.incomplete).toHaveLength(0);
    expect(result.data.title).toBe("T");
  });

  it("handles truncated JSON with open string", () => {
    // The truncated array ["point 1" gets repaired to ["point 1"] — a valid array.
    // readingTimeMinutes is simply absent, so it's the incomplete field.
    const raw = `{"title":"Hello World","sentiment":"positive","keyPoints":["point 1`;
    const result = parsePartial(raw, ArticleSchema);
    expect(result.data.title).toBe("Hello World");
    expect(result.data.sentiment).toBe("positive");
    expect(result.incomplete).toContain("readingTimeMinutes");
    // keyPoints is present as a partial-but-valid array
    expect(result.data.keyPoints).toEqual(["point 1"]);
  });

  it("handles partially written object with no closing brace", () => {
    const raw = `{"title":"Partial Title"`;
    const result = parsePartial(raw, ArticleSchema);
    expect(result.data.title).toBe("Partial Title");
    expect(result.incomplete).toContain("sentiment");
  });

  it("returns all keys as incomplete for empty input", () => {
    const result = parsePartial("", ArticleSchema);
    expect(result.incomplete).toEqual(expect.arrayContaining(["title", "sentiment", "keyPoints", "readingTimeMinutes"]));
  });
});

// ---------------------------------------------------------------------------
// buildPrompt()
// ---------------------------------------------------------------------------

describe("buildPrompt()", () => {
  it("includes the user prompt", () => {
    const prompt = buildPrompt("Summarize this:", ArticleSchema);
    expect(prompt).toContain("Summarize this:");
  });

  it("includes JSON format instruction", () => {
    const prompt = buildPrompt("Summarize:", ArticleSchema);
    expect(prompt).toContain("Respond ONLY with a valid JSON object");
  });

  it("includes field names from the schema", () => {
    const prompt = buildPrompt("Summarize:", ArticleSchema);
    expect(prompt).toContain("title");
    expect(prompt).toContain("sentiment");
    expect(prompt).toContain("readingTimeMinutes");
  });

  it("appends feedback when provided", () => {
    const prompt = buildPrompt("Summarize:", ArticleSchema, "Field `score` expected number.");
    expect(prompt).toContain("Field `score` expected number.");
    expect(prompt).toContain("previous attempt feedback");
  });
});
