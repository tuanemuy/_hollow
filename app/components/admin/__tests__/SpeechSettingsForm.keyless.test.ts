import { describe, expect, it } from "vitest";
import { SpeechRecognitionConfig } from "@/core/domain/adminSettings/valueObject";
import { KEYLESS_PROVIDERS } from "../SpeechSettingsForm";
import { SPEECH_PROVIDERS_TRANSPORT } from "../schema";

// The client-side `KEYLESS_PROVIDERS` in `SpeechSettingsForm` is a manual
// mirror of the domain SSOT (`SpeechRecognitionConfig.keylessProviders` /
// `requiresApiKey`). The server enforces the real keyless gates, so a drift
// here only degrades UX (an api-key field lingers for a keyless provider),
// which is invisible to typecheck. These invariants catch that drift the same
// way the transport ↔ VO invariant guards the provider list.
describe("SpeechSettingsForm KEYLESS_PROVIDERS drift guard (Issue #788)", () => {
  it("is set-equal to the domain keyless predicate (SpeechRecognitionConfig)", () => {
    const client = [...KEYLESS_PROVIDERS].sort();
    const domainKeyless = SpeechRecognitionConfig.providers.filter(
      (provider) => !SpeechRecognitionConfig.requiresApiKey(provider),
    );
    expect(client).toEqual([...domainKeyless].sort());
  });

  it("is set-equal to the domain keylessProviders list", () => {
    expect([...KEYLESS_PROVIDERS].sort()).toEqual(
      [...SpeechRecognitionConfig.keylessProviders].sort(),
    );
  });

  it("only contains providers known to the transport enum", () => {
    for (const provider of KEYLESS_PROVIDERS) {
      expect(SPEECH_PROVIDERS_TRANSPORT).toContain(provider);
    }
  });
});
