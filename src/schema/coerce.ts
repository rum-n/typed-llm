import type { FieldDescriptor, SchemaShape } from "./types.js";
import {
  ArrayField,
  BooleanField,
  NumberField,
  ObjectField,
  OptionalField,
  StringField,
  UnionField,
} from "./types.js";

// ---------------------------------------------------------------------------
// Coercion — run before validation to fix common LLM output quirks
// ---------------------------------------------------------------------------

/**
 * Recursively coerce a raw value according to the field descriptor.
 * Coercion only activates when the field (or an ancestor) has `_coerce: true`.
 */
export function coerceValue(value: unknown, field: FieldDescriptor): unknown {
  if (field instanceof OptionalField) {
    if (value === null || value === undefined || value === "") return undefined;
    return coerceValue(value, field.inner);
  }

  if (field instanceof ArrayField) {
    const arr = field._coerce ? toArray(value) : value;
    if (!Array.isArray(arr)) return arr;
    return arr.map((item) => coerceValue(item, field.item));
  }

  if (field instanceof ObjectField) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    return coerceShape(value as Record<string, unknown>, field.shape);
  }

  if (!field._coerce) return value;

  if (field instanceof StringField) return toString(value);
  if (field instanceof NumberField) return toNumber(value);
  if (field instanceof BooleanField) return toBoolean(value);
  if (field instanceof UnionField) return toUnionMember(value, field.members);

  return value;
}

export function coerceShape(
  raw: Record<string, unknown>,
  shape: SchemaShape,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...raw };
  for (const [key, field] of Object.entries(shape)) {
    if (key in result || field instanceof OptionalField) {
      result[key] = coerceValue(result[key], field);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Primitive coercions
// ---------------------------------------------------------------------------

function toString(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNumber(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // "9.5" → 9.5
    const direct = Number(value.trim());
    if (!Number.isNaN(direct)) return direct;
    // "5 minutes" → 5  (extract leading numeric portion)
    const match = value.trim().match(/^-?[\d,]+\.?\d*/);
    if (match) {
      const cleaned = match[0]!.replace(/,/g, "");
      const parsed = Number(cleaned);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function toBoolean(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") return true;
    if (lower === "false" || lower === "no" || lower === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return value;
}

function toArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    // "tag1, tag2" → ["tag1", "tag2"]
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  // Wrap a single non-string value in an array
  if (value !== null && value !== undefined) return [value];
  return [];
}

function toUnionMember(value: unknown, members: readonly string[]): unknown {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const match = members.find((m) => m.toLowerCase() === lower);
    if (match) return match;
  }
  return value;
}
