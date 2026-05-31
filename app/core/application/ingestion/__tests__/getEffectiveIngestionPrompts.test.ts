import { describe, expect, it, vi } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import type { UserId as IdentityUserId } from "@/core/domain/identity/valueObject";
import type {
  IngestionPromptPurpose,
  PromptResolver,
} from "@/core/domain/ingestion/ports/promptResolver";
import { getEffectiveIngestionPrompts } from "../getEffectiveIngestionPrompts";

const ACTOR = "00000000-0000-7000-9000-000000000001";

type OverrideEntry = { text: string; expectedVariables: readonly string[] };

// Build a container whose `promptResolver.resolveFor` returns per-purpose
// text from `resolved`, and whose user-override repository returns a row
// with `prompts` = `override` (or `null` for "no row").
function makeContainer(parts: {
  resolved: Partial<Record<IngestionPromptPurpose, string>>;
  override: Record<string, OverrideEntry> | null;
}): { container: RequestContainer; resolveFor: ReturnType<typeof vi.fn> } {
  const resolveFor = vi.fn(
    async (_userId: IdentityUserId, purpose: IngestionPromptPurpose) =>
      parts.resolved[purpose] ?? "",
  );
  const promptResolver: PromptResolver = { resolveFor };

  const findByOwner = vi.fn(async () =>
    parts.override === null ? null : { entity: { prompts: parts.override } },
  );
  const uowCtx = {
    userPromptOverrideRepository: { findByOwner },
  } as unknown as UnitOfWorkContext;

  const container = {
    promptResolver,
    unitOfWorkProvider: {
      async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
        return fn(uowCtx);
      },
    },
  } as unknown as RequestContainer;

  return { container, resolveFor };
}

describe("getEffectiveIngestionPrompts", () => {
  it("returns the resolved text for structure and metadata", async () => {
    const { container } = makeContainer({
      resolved: { structure: "STRUCT", metadata: "META" },
      override: null,
    });
    const out = await getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: ACTOR },
    });
    expect(out.structure.text).toBe("STRUCT");
    expect(out.metadata.text).toBe("META");
  });

  it("marks isUserOverride true only when the override entry has non-empty text", async () => {
    const { container } = makeContainer({
      resolved: { structure: "USER STRUCT", metadata: "INSTANCE META" },
      override: {
        structure: { text: "USER STRUCT", expectedVariables: [] },
        // Empty-text override row: resolver falls back to instance default,
        // so isUserOverride must stay false (predicate parity with resolver).
        metadata: { text: "", expectedVariables: [] },
      },
    });
    const out = await getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: ACTOR },
    });
    expect(out.structure.isUserOverride).toBe(true);
    expect(out.metadata.isUserOverride).toBe(false);
  });

  it("treats a missing override row as no user override", async () => {
    const { container } = makeContainer({
      resolved: { structure: "INSTANCE STRUCT", metadata: "INSTANCE META" },
      override: null,
    });
    const out = await getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: ACTOR },
    });
    expect(out.structure.isUserOverride).toBe(false);
    expect(out.metadata.isUserOverride).toBe(false);
  });

  it("treats an override row missing the purpose key as no user override", async () => {
    const { container } = makeContainer({
      resolved: { structure: "INSTANCE STRUCT", metadata: "META" },
      override: {
        // Only an unrelated purpose is overridden.
        title: { text: "USER TITLE", expectedVariables: [] },
      },
    });
    const out = await getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: ACTOR },
    });
    expect(out.structure.isUserOverride).toBe(false);
    expect(out.metadata.isUserOverride).toBe(false);
  });

  it("resolves only the structure and metadata purposes", async () => {
    const { resolveFor, container } = makeContainer({
      resolved: { structure: "S", metadata: "M" },
      override: null,
    });
    await getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: ACTOR },
    });
    const purposes = resolveFor.mock.calls.map((c) => c[1]);
    expect(new Set(purposes)).toEqual(new Set(["structure", "metadata"]));
  });
});
