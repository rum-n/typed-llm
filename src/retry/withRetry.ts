import type { OutputSchema } from "../schema/define.js";
import type { InferShape, SchemaShape } from "../schema/types.js";
import { parse, type ParseResult } from "../parse/parse.js";
import { formatErrorsForFeedback } from "../parse/errors.js";

// ---------------------------------------------------------------------------
// withRetry options
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of LLM calls (initial + retries). Default: 3. */
  maxRetries?: number;
  /**
   * Called before each retry with the attempt index (0 = first retry).
   * Useful for logging or adding backoff delays.
   */
  onRetry?: (attempt: number, feedback: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// withRetry()
// ---------------------------------------------------------------------------

/**
 * Wraps an LLM call with automatic retry on parse/validation failure.
 *
 * The `callLLM` function receives an optional `feedback` string on retries —
 * pass it to `buildPrompt` so the LLM knows exactly what to fix.
 *
 * @example
 * const result = await withRetry(
 *   (feedback) => callLLM(buildPrompt(userPrompt, ArticleSchema, feedback)),
 *   ArticleSchema,
 *   { maxRetries: 3 },
 * );
 */
export async function withRetry<S extends SchemaShape>(
  callLLM: (feedback: string | undefined) => string | Promise<string>,
  schema: OutputSchema<S>,
  options: RetryOptions = {},
): Promise<ParseResult<InferShape<S>>> {
  const maxRetries = options.maxRetries ?? 3;

  let lastResult: ParseResult<InferShape<S>> | undefined;
  let feedback: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0 && options.onRetry) {
      await options.onRetry(attempt - 1, feedback!);
    }

    const raw = await callLLM(feedback);
    const result = parse(raw, schema);

    if (result.success) return result;

    lastResult = result;
    feedback = formatErrorsForFeedback(result.errors);
  }

  return lastResult!;
}
