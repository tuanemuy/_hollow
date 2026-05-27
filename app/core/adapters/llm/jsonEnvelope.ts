/**
 * Robust JSON envelope extractor shared by LLM adapters.
 *
 * Even when prompted "Respond with a single JSON object only", models
 * routinely return one of the following deviations:
 * - Code fences (` ```json ... ``` `, ` ``` ... ``` `, `~~~ ... ~~~`)
 * - Leading prose ("Sure, here you go:") before the object
 * - The envelope wrapped in a top-level array (`[{ ... }]`)
 *
 * `extractJsonObject` accepts the raw model text and returns the parsed
 * envelope as `Record<string, unknown>` when one can be recovered.
 * Returns `null` when no recoverable JSON object is present — the caller
 * is expected to translate `null` into a retry / `LLMUnavailableError`.
 *
 * The brace scanner walks the input once and skips JSON string literals
 * verbatim (including `\"`, `\\`, and `\uXXXX` escapes), so braces or
 * quotes that appear inside string values do not affect depth counting.
 *
 * Array fallback rule: if no top-level `{...}` parses but a top-level
 * `[...]` does and its first element is a JSON object, that element is
 * returned as the envelope. Array-of-string responses (`["a","b"]`) and
 * empty arrays are treated as non-envelopes and yield `null` — callers
 * should retry rather than fabricate an empty envelope.
 */
export function extractJsonObject(
  text: string,
): Record<string, unknown> | null {
  const stripped = stripFences(text).trim();
  if (stripped.length === 0) return null;

  // Walk every `{` candidate. Models occasionally prepend prose with its
  // own brace pairs (e.g. `Greeting {John}, here: {"k":1}`), so the first
  // brace-balanced slice may not be the real envelope.
  let searchFrom = 0;
  while (true) {
    const slice = findBalancedSlice(stripped, "{", "}", searchFrom);
    if (slice === null) break;
    const parsed = safeParseObject(slice.text);
    if (parsed !== null) return parsed;
    searchFrom = slice.start + 1;
  }

  const arraySlice = findBalancedSlice(stripped, "[", "]", 0);
  if (arraySlice !== null) {
    const parsed = safeParseArrayHead(arraySlice.text);
    if (parsed !== null) return parsed;
  }

  return null;
}

function stripFences(text: string): string {
  let s = text.trim();
  // Strip a leading ```<lang>?\n? and a trailing ``` (or ~~~ variant).
  const fenceStart = /^(?:```|~~~)[a-zA-Z0-9_-]*\s*\n?/;
  const fenceEnd = /\n?\s*(?:```|~~~)\s*$/;
  if (fenceStart.test(s)) {
    s = s.replace(fenceStart, "");
  }
  if (fenceEnd.test(s)) {
    s = s.replace(fenceEnd, "");
  }
  return s;
}

type BalancedSlice = { start: number; text: string };

function findBalancedSlice(
  text: string,
  open: "{" | "[",
  close: "}" | "]",
  searchFrom: number,
): BalancedSlice | null {
  const start = text.indexOf(open, searchFrom);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (ch === 0x5c /* \ */) {
        // Skip the escape sequence. JSON escapes are either a single
        // character (\", \\, \/, \b, \f, \n, \r, \t) or a 4-digit
        // unicode escape (\uXXXX). The brace scanner only needs to
        // advance past the backslash and its escaped char; the loop's
        // i++ handles the rest naturally because \uXXXX hex digits are
        // not special outside of a string state.
        i += 1;
        continue;
      }
      if (ch === 0x22 /* " */) {
        inString = false;
      }
      continue;
    }
    if (ch === 0x22 /* " */) {
      inString = true;
      continue;
    }
    if (text[i] === open) {
      depth += 1;
    } else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) {
        return { start, text: text.slice(start, i + 1) };
      }
    }
  }
  return null;
}

function safeParseObject(slice: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function safeParseArrayHead(slice: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const head = parsed[0];
    if (head !== null && typeof head === "object" && !Array.isArray(head)) {
      return head as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
