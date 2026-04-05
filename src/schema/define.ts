import type { InferShape, SchemaShape } from "./types.js";

// ---------------------------------------------------------------------------
// OutputSchema — the container returned by defineOutput()
// ---------------------------------------------------------------------------

export interface OutputSchema<S extends SchemaShape> {
  readonly shape: S;
  /** Phantom type brand so InferOutput can extract the shape. */
  readonly _output: InferShape<S>;
}

/**
 * Declare the expected output shape for an LLM response.
 *
 * @example
 * const ArticleSchema = defineOutput({
 *   title: t.string(),
 *   sentiment: t.union(["positive", "negative", "neutral"]),
 *   keyPoints: t.array(t.string()),
 *   readingTimeMinutes: t.number(),
 * });
 *
 * type Article = InferOutput<typeof ArticleSchema>;
 */
export function defineOutput<S extends SchemaShape>(shape: S): OutputSchema<S> {
  return {
    shape,
    // _output is only used for type inference — the runtime value is never accessed
    _output: undefined as unknown as InferShape<S>,
  };
}

/**
 * Extract the TypeScript type from an OutputSchema.
 *
 * @example
 * type Article = InferOutput<typeof ArticleSchema>;
 */
export type InferOutput<Schema extends OutputSchema<SchemaShape>> =
  Schema["_output"];
