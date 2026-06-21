import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/core/application/errors";
import { ensurePublicResourceExists } from "../publicStatusBridge";

describe("ensurePublicResourceExists", () => {
  it("runs the existence check and resolves when the resource exists", async () => {
    // Assert `check` actually runs — dropping the pre-check would silently
    // regress the 404 behaviour, so the call itself is part of the contract.
    const check = vi.fn(async () => ({ id: "exists" }));
    await expect(ensurePublicResourceExists(check)).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledTimes(1);
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
