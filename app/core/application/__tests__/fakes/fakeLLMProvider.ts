import type {
  LLMMetadataInput,
  LLMMetadataResult,
  LLMProvider,
  LLMStructureInput,
  LLMStructureResult,
} from "@/core/domain/ingestion/ports/llmProvider";

/**
 * In-memory `LLMProvider` returning deterministic stub envelopes. Tests
 * that exercise ingestion pipelines around the LLM call (rather than
 * the LLM call itself) can rely on the fixed output shape; tests that
 * need a specific response inject overrides via `setStructureResult`
 * / `setMetadataResult` per case.
 */
export class FakeLLMProvider implements LLMProvider {
  readonly structureCalls: LLMStructureInput[] = [];
  readonly metadataCalls: LLMMetadataInput[] = [];

  private structureResult: LLMStructureResult = {
    html: "<p>fake structured</p>",
    titleSuggestion: "Fake title",
    directorySuggestion: null,
  };
  private metadataResult: LLMMetadataResult = {
    tags: [],
    aliases: [],
  };

  setStructureResult(result: LLMStructureResult): void {
    this.structureResult = result;
  }

  setMetadataResult(result: LLMMetadataResult): void {
    this.metadataResult = result;
  }

  async structureToHtml(input: LLMStructureInput): Promise<LLMStructureResult> {
    this.structureCalls.push(input);
    return this.structureResult;
  }

  async suggestMetadata(input: LLMMetadataInput): Promise<LLMMetadataResult> {
    this.metadataCalls.push(input);
    return this.metadataResult;
  }
}
