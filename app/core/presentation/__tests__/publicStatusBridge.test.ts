import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/core/application/errors";
import { ensurePublicResourceExists } from "../publicStatusBridge";

describe("ensurePublicResourceExists", () => {
  it("resolves without throwing when the resource exists", async () => {
    await expect(
      ensurePublicResourceExists(async () => ({ id: "exists" })),
    ).resolves.toBeUndefined();
  });

  it("translates a NotFoundError into a router notFound (→ 404 document)", async () => {
    let thrown: unknown;
    try {
      await ensurePublicResourceExists(async () => {
        throw new NotFoundError("note", "Note not found: x");
      });
    } catch (error) {
      thrown = error;
    }
    // A router notFound is what drives the document to HTTP 404 and the
    // route's notFoundComponent; a raw NotFoundError would not.
    expect(isNotFound(thrown)).toBe(true);
  });

  it("re-throws non-NotFoundError errors unchanged (→ 500 / system)", async () => {
    const boom = new Error("boom");
    await expect(
      ensurePublicResourceExists(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
