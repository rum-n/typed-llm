# typed-llm

**Reliably typed outputs from any LLM API.**

LLMs are powerful but unpredictable: they return strings instead of numbers, miss required fields, wrap JSON in markdown, and sometimes produce nonsense. `typed-llm` is a small TypeScript toolkit — inspired by Python's [Instructor](https://github.com/jxnl/instructor) — that puts a typed, validated, coercible layer between your code and the raw LLM output. Define your expected shape once, get back a fully typed result or structured errors, with built-in retry and streaming support.

---

## Installation

```bash
npm install typed-llm
```

`typed-llm` has no required runtime dependencies. It works with any LLM provider.

---

## Quickstart

```ts
import { defineOutput, t, buildPrompt, parse, withRetry } from "typed-llm";
import OpenAI from "openai";

// 1. Define your expected shape — TypeScript type is inferred automatically
const ArticleSchema = defineOutput({
  title: t.string(),
  sentiment: t.union(["positive", "negative", "neutral"] as const),
  keyPoints: t.array(t.string()),
  readingTimeMinutes: t.number().coerce(), // coerce "5 minutes" → 5
});

type Article = InferOutput<typeof ArticleSchema>;

// 2. Build a prompt that instructs the LLM to return JSON
const userPrompt = "Analyze this article: ...";
const fullPrompt = buildPrompt(userPrompt, ArticleSchema);

// 3. Call the LLM with automatic retry on validation failure
const client = new OpenAI();

const result = await withRetry(
  (feedback) =>
    client.chat.completions
      .create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: buildPrompt(userPrompt, ArticleSchema, feedback),
          },
        ],
      })
      .then((r) => r.choices[0]?.message.content ?? ""),
  ArticleSchema,
  { maxRetries: 3 },
);

if (result.success) {
  console.log(result.data.title); // fully typed: string
  console.log(result.data.readingTimeMinutes); // number, even if LLM said "5 minutes"
} else {
  console.error(result.errors); // structured field-level errors
}
```

---

## API Reference

### `defineOutput(shape)`

Declare the expected output shape. Returns an `OutputSchema` that carries the TypeScript type as a phantom brand — no runtime type duplication.

```ts
const Schema = defineOutput({
  title: t.string(),
  score: t.number().coerce(),
  tags: t.array(t.string()),
  status: t.union(["active", "inactive"] as const),
  description: t.optional(t.string()),
});

type MyType = InferOutput<typeof Schema>;
// { title: string; score: number; tags: string[]; status: "active" | "inactive"; description?: string }
```

---

### Field builders — `t.*`

| Builder                       | TypeScript type       | Notes                           |
| ----------------------------- | --------------------- | ------------------------------- |
| `t.string()`                  | `string`              |                                 |
| `t.number()`                  | `number`              |                                 |
| `t.boolean()`                 | `boolean`             |                                 |
| `t.union(["a","b"] as const)` | `"a" \| "b"`          | Validates membership            |
| `t.array(t.string())`         | `string[]`            | Nested field builders supported |
| `t.object({ ... })`           | `{ ... }`             | Nested objects                  |
| `t.optional(t.string())`      | `string \| undefined` | Field may be absent             |

All builders support `.coerce()` to enable automatic coercion before validation.

---

### Coercion — `.coerce()`

Adding `.coerce()` to any field enables automatic type coercion for common LLM output quirks:

| Raw LLM value      | Field type                     | Coerced to                     |
| ------------------ | ------------------------------ | ------------------------------ |
| `"9.5"`            | `t.number().coerce()`          | `9.5`                          |
| `"5 minutes"`      | `t.number().coerce()`          | `5`                            |
| `"yes"` / `"true"` | `t.boolean().coerce()`         | `true`                         |
| `"no"` / `"false"` | `t.boolean().coerce()`         | `false`                        |
| `"tag1, tag2"`     | `t.array(t.string()).coerce()` | `["tag1", "tag2"]`             |
| `"Positive"`       | `t.union([...]).coerce()`      | `"positive"` (case-normalized) |

Coercion is opt-in per field — fields without `.coerce()` are validated strictly.

---

### `buildPrompt(userPrompt, schema, feedback?)`

Appends a clear format instruction to your prompt, telling the LLM to respond with JSON matching your schema.

```ts
const fullPrompt = buildPrompt("Summarize this article:", ArticleSchema);
// → "Summarize this article:\n\nRespond ONLY with a valid JSON object matching..."

// With retry feedback (passed automatically by withRetry):
const retryPrompt = buildPrompt(
  "Summarize:",
  ArticleSchema,
  "Field `score` expected number, got string.",
);
```

---

### `parse(rawOutput, schema)`

Parse and validate a raw LLM string. Returns a discriminated union result.

```ts
const result = parse(rawLLMOutput, ArticleSchema);

if (result.success) {
  console.log(result.data); // InferOutput<typeof ArticleSchema>
} else {
  console.log(result.errors.code); // "INVALID_JSON" | "MISSING_JSON" | "VALIDATION_FAILED"
  console.log(result.errors.fieldErrors); // [{ path, message, received, expected }]
}
```

- Automatically extracts JSON from markdown fences (` ```json ... ``` `)
- Extracts JSON embedded in surrounding prose
- Runs coercion before validation

---

### `parsePartial(incompleteJSON, schema)`

Parse an incomplete JSON string — useful for streaming before the full response arrives.

```ts
const partial = parsePartial(
  '{"title":"Hello World","sentiment":"pos',
  ArticleSchema,
);
// {
//   data: { title: "Hello World" },
//   incomplete: ["sentiment", "keyPoints", "readingTimeMinutes"]
// }
```

---

### `withRetry(callLLM, schema, options?)`

Wraps an LLM call with automatic retry on parse/validation failure. On each retry, passes structured error feedback to the LLM so it can correct specific fields.

```ts
const result = await withRetry(
  (feedback) => callLLM(buildPrompt(userPrompt, ArticleSchema, feedback)),
  ArticleSchema,
  {
    maxRetries: 3, // total attempts (default: 3)
    onRetry: (attempt, feedback) => {
      console.log(`Retry ${attempt + 1}:`, feedback);
    },
  },
);
```

The `feedback` string passed to `callLLM` is `undefined` on the first attempt, and a human-readable error description on subsequent attempts (e.g. `"Field \`score\`: expected number, got string"`).

---

### `parseStream(chunks, schema)`

Accepts an `AsyncIterable<string>` of text chunks and yields progressive `PartialParseResult` values.

```ts
for await (const partial of parseStream(stream, ArticleSchema)) {
  updateUI(partial.data); // Partial<Article> — grows as more fields arrive
  showPending(partial.incomplete); // string[] of field names not yet received
}
```

#### Stream adapters

Use the built-in adapters to extract text deltas from provider-specific stream formats:

```ts
import { openAIStream, anthropicStream } from "typed-llm";

// OpenAI
const stream = await openai.chat.completions.create({ ..., stream: true });
for await (const partial of parseStream(openAIStream(stream), schema)) { ... }

// Anthropic
const stream = anthropic.messages.stream({ ... });
for await (const partial of parseStream(anthropicStream(stream), schema)) { ... }
```

---

## Comparison

| Feature                       | typed-llm   | Zod alone | OpenAI Structured Outputs | Vercel AI SDK      |
| ----------------------------- | ----------- | --------- | ------------------------- | ------------------ |
| Provider-agnostic             | ✅          | ✅        | ❌ OpenAI only            | ✅                 |
| Coercion layer                | ✅ built-in | ❌ manual | ❌                        | ❌                 |
| Retry with field feedback     | ✅          | ❌        | ❌                        | ❌                 |
| Streaming partial parse       | ✅          | ❌        | ❌                        | ✅ partial         |
| Zero runtime type duplication | ✅          | ✅        | ❌ schema + type separate | ✅                 |
| No framework lock-in          | ✅          | ✅        | ❌                        | ❌ requires AI SDK |
| JSON extraction from prose    | ✅          | ❌        | ❌                        | ❌                 |
| Field-level error paths       | ✅          | ✅        | ❌                        | ❌                 |

---

## Contributing

Contributions welcome. The codebase is intentionally small — each feature lives in a dedicated file with a matching test file.

```bash
git clone <repo>
cd typed-llm
npm install
npm test          # run all tests with Vitest
npm run typecheck # strict TypeScript check
npm run build     # build with tsdown
```

Adding a new feature:

1. Add or extend a file in `src/`
2. Export it from `src/index.ts`
3. Add tests in `tests/`
4. Update this README

Please keep the library framework-agnostic and dependency-free. If a feature requires a dependency, it should be an optional peer dependency.

---

## License

MIT
