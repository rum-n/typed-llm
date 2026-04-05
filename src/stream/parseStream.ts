import type { OutputSchema } from "../schema/define.js";
import type { InferShape, SchemaShape } from "../schema/types.js";
import { parsePartial, type PartialParseResult } from "../parse/partial.js";

// ---------------------------------------------------------------------------
// parseStream()
// ---------------------------------------------------------------------------

/**
 * Accepts an async iterable of string chunks (standard LLM stream format),
 * accumulates them, and yields progressive partial parse results.
 *
 * Compatible with OpenAI and Anthropic stream chunk formats — pass the
 * raw text delta strings directly.
 *
 * @example
 * // OpenAI
 * const stream = await openai.chat.completions.create({ ..., stream: true });
 * for await (const partial of parseStream(openaiTextDeltas(stream), ArticleSchema)) {
 *   updateUI(partial.data);
 * }
 *
 * // Anthropic
 * const stream = await anthropic.messages.stream({ ... });
 * for await (const partial of parseStream(anthropicTextDeltas(stream), ArticleSchema)) {
 *   updateUI(partial.data);
 * }
 */
export async function* parseStream<S extends SchemaShape>(
  chunks: AsyncIterable<string>,
  schema: OutputSchema<S>,
): AsyncGenerator<PartialParseResult<InferShape<S>>> {
  let accumulated = "";

  for await (const chunk of chunks) {
    accumulated += chunk;

    // Only attempt parsing once we have the opening brace
    if (!accumulated.includes("{")) continue;

    const partial = parsePartial(accumulated, schema);
    yield partial;

    // Stop early if all fields are present
    if (partial.incomplete.length === 0) break;
  }

  // Yield a final result from the fully accumulated text
  if (accumulated.includes("{")) {
    yield parsePartial(accumulated, schema);
  }
}

// ---------------------------------------------------------------------------
// Stream adapter helpers — extract text delta strings from provider streams
// ---------------------------------------------------------------------------

/**
 * Extracts text deltas from an OpenAI chat completion stream.
 * Pass the result to `parseStream`.
 *
 * @example
 * const stream = await openai.chat.completions.create({ ..., stream: true });
 * for await (const partial of parseStream(openAIStream(stream), schema)) { ... }
 */
export async function* openAIStream(
  stream: AsyncIterable<{ choices: Array<{ delta: { content?: string | null } }> }>,
): AsyncGenerator<string> {
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

/**
 * Extracts text deltas from an Anthropic messages stream.
 * Pass the result to `parseStream`.
 *
 * @example
 * const stream = anthropic.messages.stream({ ... });
 * for await (const partial of parseStream(anthropicStream(stream), schema)) { ... }
 */
export async function* anthropicStream(
  stream: AsyncIterable<{
    type: string;
    delta?: { type: string; text?: string };
  }>,
): AsyncGenerator<string> {
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const text = event.delta.text;
      if (text) yield text;
    }
  }
}
