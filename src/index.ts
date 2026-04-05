// ---------------------------------------------------------------------------
// llm-schema — public API
// ---------------------------------------------------------------------------

// Schema definition
export { defineOutput } from "./schema/define.js";
export type { InferOutput, OutputSchema } from "./schema/define.js";

// Field type builders
export { t } from "./schema/types.js";
export type {
  FieldDescriptor,
  FieldKind,
  InferField,
  InferShape,
  SchemaShape,
} from "./schema/types.js";
export {
  ArrayField,
  BooleanField,
  NumberField,
  ObjectField,
  OptionalField,
  StringField,
  UnionField,
} from "./schema/types.js";

// Coercion
export { coerceShape, coerceValue } from "./schema/coerce.js";

// Parsing
export { parse } from "./parse/parse.js";
export type { ParseResult } from "./parse/parse.js";

export { parsePartial } from "./parse/partial.js";
export type { PartialParseResult } from "./parse/partial.js";

export type { FieldError, ParseError } from "./parse/errors.js";
export { formatErrorsForFeedback } from "./parse/errors.js";

// Prompt building
export { buildPrompt } from "./prompt/build.js";

// Retry
export { withRetry } from "./retry/withRetry.js";
export type { RetryOptions } from "./retry/withRetry.js";

// Streaming
export { anthropicStream, openAIStream, parseStream } from "./stream/parseStream.js";
