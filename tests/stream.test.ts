import { describe, expect, it } from "vitest";
import { defineOutput } from "../src/schema/define.js";
import { t } from "../src/schema/types.js";
import { parseStream, openAIStream, anthropicStream } from "../src/stream/parseStream.js";

const Schema = defineOutput({
  title: t.string(),
  count: t.number().coerce(),
  tags: t.array(t.string()),
});

// Helper: turn an array of strings into an async iterable
async function* toAsyncIterable(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

// ---------------------------------------------------------------------------
// parseStream()
// ---------------------------------------------------------------------------

describe("parseStream()", () => {
  it("yields partial results as chunks accumulate", async () => {
    const json = JSON.stringify({ title: "Hello", count: 5, tags: ["a", "b"] });
    // Split into small chunks to simulate streaming
    const chunkSize = 5;
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += chunkSize) {
      chunks.push(json.slice(i, i + chunkSize));
    }

    const results: Array<{ incomplete: string[] }> = [];
    for await (const partial of parseStream(toAsyncIterable(chunks), Schema)) {
      results.push({ incomplete: partial.incomplete });
    }

    expect(results.length).toBeGreaterThan(0);
    const last = results[results.length - 1]!;
    expect(last.incomplete).toHaveLength(0);
  });

  it("final result has all fields complete", async () => {
    const json = JSON.stringify({ title: "T", count: 2, tags: ["x"] });
    const chunks = [json];

    let last;
    for await (const partial of parseStream(toAsyncIterable(chunks), Schema)) {
      last = partial;
    }

    expect(last?.data.title).toBe("T");
    expect(last?.data.count).toBe(2);
    expect(last?.data.tags).toEqual(["x"]);
    expect(last?.incomplete).toHaveLength(0);
  });

  it("handles truncated stream gracefully", async () => {
    const truncated = `{"title":"Partial`;
    const chunks = [truncated];

    const results = [];
    for await (const partial of parseStream(toAsyncIterable(chunks), Schema)) {
      results.push(partial);
    }

    const last = results[results.length - 1]!;
    expect(last.data.title).toBe("Partial");
    expect(last.incomplete).toContain("count");
    expect(last.incomplete).toContain("tags");
  });

  it("coerces fields while streaming", async () => {
    const json = JSON.stringify({ title: "T", count: "7 items", tags: [] });
    for await (const partial of parseStream(toAsyncIterable([json]), Schema)) {
      if (partial.incomplete.length === 0) {
        expect(partial.data.count).toBe(7);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// openAIStream adapter
// ---------------------------------------------------------------------------

describe("openAIStream()", () => {
  it("extracts text deltas from OpenAI chunk format", async () => {
    async function* mockOpenAIStream() {
      yield { choices: [{ delta: { content: '{"title"' } }] };
      yield { choices: [{ delta: { content: ':"Test"}' } }] };
      yield { choices: [{ delta: {} }] }; // empty delta (finish reason chunk)
    }

    const parts: string[] = [];
    for await (const chunk of openAIStream(mockOpenAIStream())) {
      parts.push(chunk);
    }
    expect(parts.join("")).toBe('{"title":"Test"}');
  });

  it("skips chunks with no content", async () => {
    async function* mockStream() {
      yield { choices: [{ delta: { content: null } }] };
      yield { choices: [{ delta: { content: "hello" } }] };
    }

    const parts: string[] = [];
    for await (const chunk of openAIStream(mockStream())) {
      parts.push(chunk);
    }
    expect(parts).toEqual(["hello"]);
  });
});

// ---------------------------------------------------------------------------
// anthropicStream adapter
// ---------------------------------------------------------------------------

describe("anthropicStream()", () => {
  it("extracts text deltas from Anthropic event format", async () => {
    async function* mockAnthropicStream() {
      yield { type: "content_block_start", index: 0 };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: '{"title"' } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: ':"Hi"}' } };
      yield { type: "message_delta" };
    }

    const parts: string[] = [];
    for await (const chunk of anthropicStream(mockAnthropicStream())) {
      parts.push(chunk);
    }
    expect(parts.join("")).toBe('{"title":"Hi"}');
  });

  it("skips non-text-delta events", async () => {
    async function* mockStream() {
      yield { type: "message_start" };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "abc" } };
      yield { type: "message_stop" };
    }

    const parts: string[] = [];
    for await (const chunk of anthropicStream(mockStream())) {
      parts.push(chunk);
    }
    expect(parts).toEqual(["abc"]);
  });
});
