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
import type { FieldError, ParseError } from "./errors.js";
import { makeJsonError, makeMissingError, makeValidationError } from "./errors.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ParseError };

// ---------------------------------------------------------------------------
// JSON extraction — LLMs sometimes wrap JSON in markdown fences
// ---------------------------------------------------------------------------

function extractJson(raw: string): { json: string; rootIsNonObject: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try to find a JSON object in markdown code blocks first
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) return { json: fenceMatch[1].trim(), rootIsNonObject: false };

  // Check if the raw string is itself parseable JSON that isn't an object
  // (e.g. "[1,2,3]" or '"string"') → that's INVALID_JSON not MISSING_JSON
  try {
    const direct = JSON.parse(trimmed);
    if (typeof direct !== "object" || direct === null || Array.isArray(direct)) {
      return { json: trimmed, rootIsNonObject: true };
    }
  } catch {
    // not directly parseable; continue to extraction
  }

  // Try to find the first `{` … last `}` in the raw output
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return { json: trimmed.slice(start, end + 1), rootIsNonObject: false };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Field-level validation (after coercion)
// ---------------------------------------------------------------------------

function validateField(
  value: unknown,
  field: FieldDescriptor,
  path: string,
  errors: FieldError[],
): void {
  if (field instanceof OptionalField) {
    if (value === undefined || value === null) return;
    validateField(value, field.inner, path, errors);
    return;
  }

  if (value === undefined || value === null) {
    errors.push({
      path,
      message: "Field is required but was missing or null.",
      received: value,
      expected: field.kind,
    });
    return;
  }

  if (field instanceof StringField) {
    if (typeof value !== "string") {
      errors.push({ path, message: "Expected a string.", received: value, expected: "string" });
    }
  } else if (field instanceof NumberField) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push({ path, message: "Expected a number.", received: value, expected: "number" });
    }
  } else if (field instanceof BooleanField) {
    if (typeof value !== "boolean") {
      errors.push({ path, message: "Expected a boolean.", received: value, expected: "boolean" });
    }
  } else if (field instanceof UnionField) {
    if (!field.members.includes(value as string)) {
      errors.push({
        path,
        message: `Expected one of: ${field.members.map((m) => `"${m}"`).join(", ")}.`,
        received: value,
        expected: field.members.join(" | "),
      });
    }
  } else if (field instanceof ArrayField) {
    if (!Array.isArray(value)) {
      errors.push({ path, message: "Expected an array.", received: value, expected: "array" });
    } else {
      value.forEach((item, i) => {
        validateField(item, field.item, `${path}[${i}]`, errors);
      });
    }
  } else if (field instanceof ObjectField) {
    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push({ path, message: "Expected an object.", received: value, expected: "object" });
    } else {
      validateShape(value as Record<string, unknown>, field.shape, path, errors);
    }
  }
}

function validateShape(
  obj: Record<string, unknown>,
  shape: SchemaShape,
  prefix: string,
  errors: FieldError[],
): void {
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key;
    validateField(obj[key], field, path, errors);
  }
}

// ---------------------------------------------------------------------------
// Public parse()
// ---------------------------------------------------------------------------

/**
 * Parse and validate raw LLM string output against a schema.
 *
 * Coercion runs automatically for any field marked with `.coerce()`.
 *
 * @example
 * const result = parse(rawLLMOutput, ArticleSchema);
 * if (result.success) {
 *   console.log(result.data.title);
 * } else {
 *   console.log(result.errors);
 * }
 */
export function parse<S extends SchemaShape>(
  raw: string,
  schema: OutputSchema<S>,
): ParseResult<InferShape<S>> {
  const extracted = extractJson(raw);
  if (extracted === null) {
    return { success: false, errors: makeMissingError() };
  }

  if (extracted.rootIsNonObject) {
    return { success: false, errors: makeJsonError(extracted.json) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch {
    return { success: false, errors: makeJsonError(extracted.json) };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { success: false, errors: makeJsonError(extracted.json) };
  }

  // Coercion pass
  const coerced = coerceShape(parsed as Record<string, unknown>, schema.shape);

  // Validation pass
  const fieldErrors: FieldError[] = [];
  validateShape(coerced, schema.shape, "", fieldErrors);

  if (fieldErrors.length > 0) {
    return { success: false, errors: makeValidationError(fieldErrors) };
  }

  return { success: true, data: coerced as InferShape<S> };
}
