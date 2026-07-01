/**
 * Shared Deepgram helpers used by both the REST (`/v1/listen`) adapter and the
 * Cloudflare Workers AI (`env.AI.run("@cf/deepgram/nova-3")`) adapter. The two
 * routes emit the identical response shape — `results.channels[0]
 * .alternatives[0].transcript` — so the extraction logic is centralized here
 * (Issue #788 / ADR-006: the Workers AI output type
 * `Ai_Cf_Deepgram_Nova_3_Output` is structurally the same as the REST body).
 */

type DeepgramTranscriptShape = Readonly<{
  results?: Readonly<{
    channels?: ReadonlyArray<
      Readonly<{
        alternatives?: ReadonlyArray<Readonly<{ transcript?: unknown }>>;
      }>
    >;
  }>;
}>;

/**
 * Extracts the first channel's first-alternative transcript, trimmed. Returns
 * `""` when the transcript field is missing / non-string / whitespace-only —
 * the port's "no detected speech" contract (never throws).
 */
export function extractDeepgramTranscript(
  body: DeepgramTranscriptShape,
): string {
  const transcript = body.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof transcript !== "string") return "";
  return transcript.trim();
}

/**
 * Maps the port `locale` (e.g. `ja` / `ja-JP`) onto the language hint
 * Deepgram's `language` parameter accepts. Best-effort: takes the first subtag
 * and lower-cases it. An empty locale yields an empty hint (caller omits it).
 */
export function localeToLanguage(locale: string): string {
  return locale.split(/[-_]/)[0]?.trim().toLowerCase() ?? "";
}
