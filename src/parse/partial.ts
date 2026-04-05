import type { OutputSchema } from "../schema/define.js";
import type { InferShape, SchemaShape } from "../schema/types.js";
import { coerceShape } from "../schema/coerce.js";
import {
  ArrayField,
  BooleanField,
  NumberField,
  ObjectField,
  OptionalField,
  StringField,
  UnionField,
  type FieldDescriptor,
} from "../schema/types.js";

// ---------------------------------------------------------------------------
// Partial parse result
// ---------------------------------------------------------------------------

export interface PartialParseResult<T> {
  /** Fields that were successfully parsed and validated */
  data: Partial<T>;
  /** Keys of fields that were absent or invalid in the partial input */
  incomplete: string[];
}

// ---------------------------------------------------------------------------
// Incomplete JSON repair — close any open braces/brackets/strings
// ---------------------------------------------------------------------------

function repairJson(raw: string): string {
  let repaired = raw.trim();

  // Strip markdown fences if present
  const fenceMatch = repaired.match(/```(?:json)?\s*\n?([\s\S]*)/);
  if (fenceMatch?.[1]) repaired = fenceMatch[1];

  // Find the start of the JSON object
  const start = repaired.indexOf("{");
  if (start === -1) return "{}";
  repaired = repaired.slice(start);

  // Track open { and [ only (not strings) — strings are tracked separately
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i]!;

    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }

    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { stack.push("{"); continue; }
    if (ch === "[") { stack.push("["); continue; }
    if (ch === "}") { if (stack[stack.length - 1] === "{") stack.pop(); continue; }
    if (ch === "]") { if (stack[stack.length - 1] === "[") stack.pop(); continue; }
  }

  let suffix = "";
  // Close any open string first
  if (inString) suffix += '"';
  // Close remaining open structures in reverse order
  for (let j = stack.length - 1; j >= 0; j--) {
    suffix += stack[j] === "{" ? "}" : "]";
  }

  // Remove trailing commas that would make partial JSON invalid
  const withSuffix = repaired + suffix;
  return withSuffix.replace(/,\s*([}\]])/g, "$1");
}

// ---------------------------------------------------------------------------
// Field-level partial validation (permissive — missing = incomplete, not error)
// ---------------------------------------------------------------------------

function isFieldValid(value: unknown, field: FieldDescriptor): boolean {
  if (field instanceof OptionalField) {
    if (value === undefined || value === null) return true;
    return isFieldValid(value, field.inner);
  }
  if (value === undefined || value === null) return false;
  if (field instanceof StringField) return typeof value === "string";
  if (field instanceof NumberField) return typeof value === "number" && !Number.isNaN(value);
  if (field instanceof BooleanField) return typeof value === "boolean";
  if (field instanceof UnionField) return field.members.includes(value as string);
  if (field instanceof ArrayField) return Array.isArray(value);
  if (field instanceof ObjectField) return typeof value === "object" && !Array.isArray(value);
  return false;
}

// ---------------------------------------------------------------------------
// Public parsePartial()
// ---------------------------------------------------------------------------

/**
 * Parse an incomplete or streaming JSON string as far as possible.
 * Returns valid fields in `data` and lists missing/invalid keys in `incomplete`.
 *
 * @example
 * const partial = parsePartial(incompleteJSON, ArticleSchema);
 * // { data: { title: "Intro to TS" }, incomplete: ["keyPoints", "readingTimeMinutes"] }
 */
export function parsePartial<S extends SchemaShape>(
  raw: string,
  schema: OutputSchema<S>,
): PartialParseResult<InferShape<S>> {
  const repaired = repairJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch {
    return { data: {}, incomplete: Object.keys(schema.shape) };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { data: {}, incomplete: Object.keys(schema.shape) };
  }

  const coerced = coerceShape(parsed as Record<string, unknown>, schema.shape);
  const data: Record<string, unknown> = {};
  const incomplete: string[] = [];

  for (const [key, field] of Object.entries(schema.shape)) {
    const value = coerced[key];
    if (isFieldValid(value, field)) {
      data[key] = value;
    } else {
      incomplete.push(key);
    }
  }

  return { data: data as Partial<InferShape<S>>, incomplete };
}
