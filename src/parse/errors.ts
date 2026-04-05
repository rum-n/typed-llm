// ---------------------------------------------------------------------------
// Structured parse errors with field paths
// ---------------------------------------------------------------------------

export interface FieldError {
  /** Dot-separated path to the offending field, e.g. "author.name" */
  path: string;
  /** Human-readable description of what went wrong */
  message: string;
  /** The raw value that failed validation */
  received: unknown;
  /** The expected type or constraint */
  expected: string;
}

export interface ParseError {
  /** Top-level error code */
  code: "INVALID_JSON" | "VALIDATION_FAILED" | "MISSING_JSON";
  /** Human-readable summary */
  message: string;
  /** Per-field errors (empty for INVALID_JSON / MISSING_JSON) */
  fieldErrors: FieldError[];
}

export function makeJsonError(raw: string): ParseError {
  return {
    code: "INVALID_JSON",
    message: `Could not parse LLM output as JSON. Raw output: ${raw.slice(0, 200)}`,
    fieldErrors: [],
  };
}

export function makeMissingError(): ParseError {
  return {
    code: "MISSING_JSON",
    message: "LLM output was empty or contained no JSON object.",
    fieldErrors: [],
  };
}

export function makeValidationError(fieldErrors: FieldError[]): ParseError {
  const summary = fieldErrors.map((e) => `${e.path}: ${e.message}`).join("; ");
  return {
    code: "VALIDATION_FAILED",
    message: `Validation failed: ${summary}`,
    fieldErrors,
  };
}

/** Format field errors into a concise feedback string for LLM retry prompts. */
export function formatErrorsForFeedback(errors: ParseError): string {
  if (errors.code === "INVALID_JSON") {
    return "Your previous response was not valid JSON. Respond ONLY with a JSON object.";
  }
  if (errors.code === "MISSING_JSON") {
    return "Your previous response did not contain a JSON object. Respond ONLY with a JSON object.";
  }
  const lines = errors.fieldErrors.map(
    (e) =>
      `- Field \`${e.path}\`: expected ${e.expected}, got ${JSON.stringify(e.received)}. ${e.message}`,
  );
  return `Your previous response had the following issues:\n${lines.join("\n")}\nPlease fix these and respond with a corrected JSON object.`;
}
