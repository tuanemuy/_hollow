import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import type {
  LLMMetadataInput,
  LLMMetadataResult,
  LLMProvider,
  LLMStructureInput,
  LLMStructureResult,
} from "@/core/domain/ingestion/ports/llmProvider";

/**
 * MVP LLM adapter.
 *
 * Real LLM-backed structuring (`structureToHtml` / `suggestMetadata`)
 * requires admin-supplied credentials and a chosen model — both come
 * from the persisted `LLMConfig` which is not yet wired through the
 * container at construction time. The usecase layer surfaces the
 * resulting `BusinessRuleError` as a non-retryable "feature not
 * available yet" so the ingestion job transitions to `failed` with a
 * clear error code rather than burning worker retries.
 *
 * MVP 内では LLM 経由の構造化は未対応。実 adapter を投入する場合は
 * 本クラスを `AnthropicLLMProvider` に差し替える。
 */
export class StubLLMProvider implements LLMProvider {
  async structureToHtml(
    _input: LLMStructureInput,
  ): Promise<LLMStructureResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "llm_not_implemented_in_mvp",
    );
  }

  async suggestMetadata(_input: LLMMetadataInput): Promise<LLMMetadataResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "llm_not_implemented_in_mvp",
    );
  }
}
