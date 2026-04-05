import type { OutputSchema } from "../schema/define.js";
import type { SchemaShape } from "../schema/types.js";
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
// Schema → human-readable type string
// ---------------------------------------------------------------------------

function fieldToTypeString(field: FieldDescriptor): string {
  if (field instanceof OptionalField) return `${fieldToTypeString(field.inner)} | undefined`;
  if (field instanceof StringField) return "string";
  if (field instanceof NumberField) return "number";
  if (field instanceof BooleanField) return "boolean";
  if (field instanceof UnionField) return field.members.map((m) => `"${m}"`).join(" | ");
  if (field instanceof ArrayField) return `Array<${fieldToTypeString(field.item)}>`;
  if (field instanceof ObjectField) return shapeToTypeString(field.shape);
  return "unknown";
}

function shapeToTypeString(shape: SchemaShape): string {
  const entries = Object.entries(shape).map(([key, field]) => {
    const isOptional = field instanceof OptionalField;
    const typeStr = isOptional ? fieldToTypeString((field as OptionalField<FieldDescriptor>).inner) : fieldToTypeString(field);
    return `  ${key}${isOptional ? "?" : ""}: ${typeStr}`;
  });
  return `{\n${entries.join(",\n")}\n}`;
}

// ---------------------------------------------------------------------------
// Public buildPrompt()
// ---------------------------------------------------------------------------

/**
 * Append a structured format instruction to a user prompt.
 *
 * Optionally include `feedback` (from a previous failed attempt) so the LLM
 * knows exactly what to fix on retry.
 *
 * @example
 * const fullPrompt = buildPrompt("Summarize this article:", ArticleSchema);
 * // → "Summarize this article:\n\nRespond ONLY with a valid JSON object..."
 *
 * // With retry feedback:
 * const retryPrompt = buildPrompt("Summarize this article:", ArticleSchema, feedback);
 */
export function buildPrompt<S extends SchemaShape>(
  userPrompt: string,
  schema: OutputSchema<S>,
  feedback?: string,
): string {
  const typeStr = shapeToTypeString(schema.shape);
  const formatInstruction = [
    "Respond ONLY with a valid JSON object matching the following TypeScript type.",
    "Do not include any explanation, markdown fences, or extra text.",
    "",
    `Type:\n${typeStr}`,
  ].join("\n");

  const parts = [userPrompt.trim(), "", formatInstruction];

  if (feedback) {
    parts.push("", "IMPORTANT — previous attempt feedback:", feedback);
  }

  return parts.join("\n");
}
