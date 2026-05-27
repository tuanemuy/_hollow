import { eq } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { UserId } from "@/core/domain/identity/valueObject";
import type {
  IngestionPromptPurpose,
  PromptResolver,
} from "@/core/domain/ingestion/ports/promptResolver";
import type { Database } from "./client";
import { instanceSettings, userPromptOverrides } from "./schema";

const SINGLETON_ID = "singleton";

/**
 * Wire shape of `prompts_json` shared between
 * `instance_settings.prompts_json` and `user_prompt_overrides.prompts_json`.
 *
 * Mirrors the structure persisted by `D1InstanceSettingsRepository` /
 * `D1UserPromptOverrideRepository`: a map keyed by `PromptPurpose`
 * (`structure` / `title` / `directory` / `metadata` / `ocr_assist`) with
 * `{ text, expectedVariables }` entries. The ingestion resolver only
 * reads `text` because the ingestion pipeline supplies fully-interpolated
 * prompts to the LLM provider — variable expansion is upstream of this
 * port, not part of the contract.
 */
type PromptJsonEntry = Readonly<{
  text: string;
  expectedVariables?: readonly string[];
}>;
type PromptsJson = Readonly<Record<string, PromptJsonEntry>>;

function parsePromptsJson(field: string, raw: string): PromptsJson {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("prompts_json is not a JSON object");
    }
    return parsed as PromptsJson;
  } catch (cause) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored ${field} is not a valid prompts JSON object`,
      cause,
    );
  }
}

/**
 * D1-backed implementation of `PromptResolver`.
 *
 * Resolution precedence: per-user override
 * (`user_prompt_overrides.prompts_json[purpose].text`) → instance default
 * (`instance_settings.prompts_json[purpose].text`) → empty string. Both
 * tables persist a `Partial<Record<PromptPurpose, ...>>` (Issue #218
 * ADR-001) where a missing key — or, on the legacy "full map + empty
 * text" path, an entry whose `text` is empty after domain rehydration —
 * signals "no override at this layer". The empty-string fallback is the
 * documented signal for ingestion callers to use the LLM-provider's
 * built-in instructions.
 *
 * Reads are immediate (no batch buffering) because this is a read-only
 * port whose result is consumed before the ingestion usecase enters its
 * unit-of-work. Two point lookups per call is acceptable for the
 * ingestion hot path; if it ever becomes a bottleneck the resolver can
 * be wrapped in an in-request cache without changing the contract.
 */
export class D1PromptResolver implements PromptResolver {
  constructor(private readonly db: Database) {}

  async resolveFor(
    userId: UserId,
    purpose: IngestionPromptPurpose,
  ): Promise<string> {
    const overrideRows = await this.db
      .select({ promptsJson: userPromptOverrides.promptsJson })
      .from(userPromptOverrides)
      .where(eq(userPromptOverrides.ownerId, userId))
      .limit(1);
    const overrideRow = overrideRows[0];
    if (overrideRow !== undefined) {
      const map = parsePromptsJson(
        "user_prompt_overrides.prompts_json",
        overrideRow.promptsJson,
      );
      const entry = map[purpose];
      if (entry !== undefined && entry.text.length > 0) {
        return entry.text;
      }
    }

    const defaultRows = await this.db
      .select({ promptsJson: instanceSettings.promptsJson })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, SINGLETON_ID))
      .limit(1);
    const defaultRow = defaultRows[0];
    if (defaultRow !== undefined) {
      const map = parsePromptsJson(
        "instance_settings.prompts_json",
        defaultRow.promptsJson,
      );
      const entry = map[purpose];
      if (entry !== undefined) {
        return entry.text;
      }
    }
    return "";
  }
}
