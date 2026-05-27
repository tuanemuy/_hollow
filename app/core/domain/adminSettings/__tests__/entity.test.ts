import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import {
  INSTANCE_SETTINGS_ID,
  InstanceSettings,
  UserPromptOverride,
} from "../entity";
import {
  DesignTokens,
  InstanceLimits,
  LLMConfig,
  PromptTemplate,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("InstanceSettings.default", () => {
  it("returns the singleton id and an empty design-tokens map", () => {
    const settings = InstanceSettings.default(T0);
    expect(settings.id).toBe(INSTANCE_SETTINGS_ID);
    expect(Object.keys(settings.designTokens.tokens)).toHaveLength(0);
  });

  it("starts at version 0 with an empty prompts map (no overrides yet)", () => {
    const settings = InstanceSettings.default(T0);
    expect(settings.version).toBe(0);
    expect(Object.keys(settings.prompts)).toHaveLength(0);
  });

  it("defaults registration to open=true with null closedReason", () => {
    const settings = InstanceSettings.default(T0);
    expect(settings.registration.open).toBe(true);
    expect(settings.registration.closedReason).toBeNull();
  });

  it("seeds default LLM config (env-sourced, anthropic)", () => {
    const settings = InstanceSettings.default(T0);
    expect(settings.llm.provider).toBe("anthropic");
    expect(settings.llm.apiKeySource).toBe("env");
    expect(settings.llm.apiKeyCiphertext).toBeNull();
  });
});

describe("InstanceSettings transitions advance version and updatedAt", () => {
  const seed = (): InstanceSettings => InstanceSettings.default(T0);

  it("updateLLM bumps version by 1 and stamps updatedAt", () => {
    const current = seed();
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "claude-3-7-haiku-latest",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = InstanceSettings.updateLLM(current, llm, at(5));
    expect(next.version).toBe(current.version + 1);
    expect(next.updatedAt.getTime()).toBe(at(5).getTime());
    expect(next.llm).toBe(llm);
  });

  it("updatePrompt installs a per-purpose override and bumps version", () => {
    const current = seed();
    const tpl = PromptTemplate.create({
      text: "Hello {{ name }}",
      expectedVariables: ["name"],
    });
    const next = InstanceSettings.updatePrompt(current, "title", tpl, at(1));
    expect(next.prompts.title).toBe(tpl);
    // Other purposes remain absent (= inherit built-in default).
    expect(next.prompts.structure).toBeUndefined();
    expect(next.version).toBe(current.version + 1);
  });

  it("resetPrompt removes a single override and bumps version", () => {
    const tpl = PromptTemplate.create({
      text: "Hello",
      expectedVariables: [],
    });
    const overridden = InstanceSettings.updatePrompt(
      seed(),
      "title",
      tpl,
      at(1),
    );
    const reset = InstanceSettings.resetPrompt(overridden, "title", at(2));
    expect(reset.prompts.title).toBeUndefined();
    expect(reset.version).toBe(overridden.version + 1);
  });

  it("resetPrompt on a missing purpose is a no-op (same instance)", () => {
    const current = seed();
    const same = InstanceSettings.resetPrompt(current, "title", at(5));
    expect(same).toBe(current);
    expect(same.version).toBe(current.version);
  });

  it("resetAllPrompts clears all overrides and bumps version", () => {
    const tpl = PromptTemplate.create({
      text: "Hello",
      expectedVariables: [],
    });
    const first = InstanceSettings.updatePrompt(seed(), "title", tpl, at(1));
    const second = InstanceSettings.updatePrompt(
      first,
      "structure",
      tpl,
      at(2),
    );
    const reset = InstanceSettings.resetAllPrompts(second, at(3));
    expect(Object.keys(reset.prompts)).toHaveLength(0);
    expect(reset.version).toBe(second.version + 1);
  });

  it("resetAllPrompts on an empty map is a no-op", () => {
    const current = seed();
    const same = InstanceSettings.resetAllPrompts(current, at(5));
    expect(same).toBe(current);
    expect(same.version).toBe(current.version);
  });

  it("updateDesignTokens replaces the map wholesale", () => {
    const current = seed();
    const tokens = DesignTokens.create({
      tokens: { "--color-primary": "#123" },
    });
    const next = InstanceSettings.updateDesignTokens(current, tokens, at(2));
    expect(next.designTokens).toBe(tokens);
    expect(next.version).toBe(current.version + 1);
  });

  it("resetDesignTokens returns to the empty default map", () => {
    const current = InstanceSettings.updateDesignTokens(
      seed(),
      DesignTokens.create({ tokens: { "--a": "1" } }),
      at(1),
    );
    const reset = InstanceSettings.resetDesignTokens(current, at(2));
    expect(Object.keys(reset.designTokens.tokens)).toHaveLength(0);
    expect(reset.version).toBe(current.version + 1);
  });

  it("setRegistrationOpen=false preserves closedReason; =true drops it", () => {
    const closed = InstanceSettings.setRegistrationOpen(
      seed(),
      false,
      "maintenance",
      at(1),
    );
    expect(closed.registration.open).toBe(false);
    expect(closed.registration.closedReason).toBe("maintenance");

    const reopened = InstanceSettings.setRegistrationOpen(
      closed,
      true,
      "still-here",
      at(2),
    );
    expect(reopened.registration.open).toBe(true);
    expect(reopened.registration.closedReason).toBeNull();
    expect(reopened.version).toBe(closed.version + 1);
  });

  it("updateLimits replaces the limits map and bumps version", () => {
    const current = seed();
    const limits = InstanceLimits.create({
      maxUploadBytesPerDay: 1,
      maxIngestionBytes: 1,
      maxNoteBytes: 1,
      maxExportArtifactBytes: 1,
      maxShareLinksPerNote: 1,
      editLockTtlSec: 1,
      trashRetentionDays: 1,
      maxNoteRevisionsPerNote: 1,
    });
    const next = InstanceSettings.updateLimits(current, limits, at(3));
    expect(next.limits).toBe(limits);
    expect(next.version).toBe(current.version + 1);
  });
});

describe("InstanceSettings.reconstruct", () => {
  const validRow = () => ({
    llm: {
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    },
    prompts: {
      structure: { text: "", expectedVariables: [] as readonly string[] },
      title: { text: "", expectedVariables: [] as readonly string[] },
      directory: { text: "", expectedVariables: [] as readonly string[] },
      metadata: { text: "", expectedVariables: [] as readonly string[] },
      ocr_assist: { text: "", expectedVariables: [] as readonly string[] },
    },
    designTokens: { tokens: {} as Record<string, string> },
    registration: { open: true, closedReason: null as string | null },
    limits: {
      maxUploadBytesPerDay: 1,
      maxIngestionBytes: 1,
      maxNoteBytes: 1,
      maxExportArtifactBytes: 1,
      maxShareLinksPerNote: 1,
      editLockTtlSec: 1,
      trashRetentionDays: 1,
    },
    version: 3,
    updatedAt: T0,
  });

  it("rebuilds a valid InstanceSettings", () => {
    const settings = InstanceSettings.reconstruct(validRow());
    expect(settings.id).toBe(INSTANCE_SETTINGS_ID);
    expect(settings.version).toBe(3);
  });

  it("rehydrates an empty prompts map from a legacy full-map row whose entries are all empty strings", () => {
    const row = validRow();
    const settings = InstanceSettings.reconstruct(row);
    // Legacy "full map + empty string" rows MUST migrate to "no overrides".
    expect(Object.keys(settings.prompts)).toHaveLength(0);
  });

  it("omits missing prompt purposes (key absence = inherit default)", () => {
    const row = validRow();
    const partial = {
      ...row,
      prompts: { structure: { text: "use this", expectedVariables: [] } },
    };
    const settings = InstanceSettings.reconstruct(partial);
    expect(settings.prompts.structure?.text).toBe("use this");
    expect(settings.prompts.title).toBeUndefined();
  });

  it("translates underlying VO failures into RehydrationError (not BusinessRuleError)", () => {
    const row = validRow();
    try {
      InstanceSettings.reconstruct({
        ...row,
        llm: { ...row.llm, provider: "unknown-provider" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });
});

describe("UserPromptOverride", () => {
  it("create initialises with empty prompts at version 0", () => {
    const override = UserPromptOverride.create({ ownerId: "user-1" }, T0);
    expect(override.ownerId as unknown as string).toBe("user-1");
    expect(Object.keys(override.prompts)).toHaveLength(0);
    expect(override.version).toBe(0);
  });

  it("setPrompt adds the per-purpose template and bumps version", () => {
    const override = UserPromptOverride.create({ ownerId: "user-1" }, T0);
    const tpl = PromptTemplate.create({ text: "x", expectedVariables: [] });
    const next = UserPromptOverride.setPrompt(override, "title", tpl, at(1));
    expect(next.prompts.title).toBe(tpl);
    expect(next.version).toBe(override.version + 1);
  });

  it("clearPrompt removes the per-purpose key and bumps version", () => {
    const override = UserPromptOverride.create({ ownerId: "user-1" }, T0);
    const tpl = PromptTemplate.create({ text: "x", expectedVariables: [] });
    const set = UserPromptOverride.setPrompt(override, "title", tpl, at(1));
    const cleared = UserPromptOverride.clearPrompt(set, "title", at(2));
    expect(cleared.prompts.title).toBeUndefined();
    expect(cleared.version).toBe(set.version + 1);
  });

  it("clearPrompt on a missing purpose is a no-op (same instance, version unchanged)", () => {
    const override = UserPromptOverride.create({ ownerId: "user-1" }, T0);
    const same = UserPromptOverride.clearPrompt(override, "title", at(5));
    expect(same).toBe(override);
    expect(same.version).toBe(override.version);
  });

  it("reconstruct rebuilds a partial overrides map and rejects invalid rows with RehydrationError", () => {
    const ok = UserPromptOverride.reconstruct({
      ownerId: "user-1",
      prompts: { title: { text: "ok", expectedVariables: [] } },
      version: 2,
      updatedAt: T0,
    });
    expect(ok.prompts.title?.text).toBe("ok");

    try {
      UserPromptOverride.reconstruct({
        ownerId: "",
        prompts: {},
        version: 0,
        updatedAt: T0,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
