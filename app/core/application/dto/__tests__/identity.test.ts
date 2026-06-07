import { describe, expect, it } from "vitest";
import { User } from "@/core/domain/identity/entity";
import { toUserDTO } from "../identity";

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

const validRow = (
  overrides: Partial<{
    updatedAt: Date;
    lastUsernameChangedAt: Date | null;
  }> = {},
) =>
  User.reconstruct({
    id: rawId(1),
    username: "alice",
    email: "alice@example.com",
    displayName: "Alice",
    bio: null,
    avatarMediaId: null,
    status: "active",
    role: "member",
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-05-14T09:24:00.000Z"),
    lastUsernameChangedAt:
      "lastUsernameChangedAt" in overrides
        ? (overrides.lastUsernameChangedAt ?? null)
        : null,
  });

describe("toUserDTO", () => {
  it("projects updatedAt as lastSavedAt (ISO instant)", () => {
    const dto = toUserDTO(
      validRow({ updatedAt: new Date("2026-05-14T09:24:00.000Z") }),
    );
    expect(dto.lastSavedAt).toBe("2026-05-14T09:24:00.000Z");
  });

  it("projects lastUsernameChangedAt = null verbatim", () => {
    const dto = toUserDTO(validRow({ lastUsernameChangedAt: null }));
    expect(dto.lastUsernameChangedAt).toBeNull();
  });

  it("projects a non-null lastUsernameChangedAt as ISO instant", () => {
    const dto = toUserDTO(
      validRow({ lastUsernameChangedAt: new Date("2026-03-01T12:00:00.000Z") }),
    );
    expect(dto.lastUsernameChangedAt).toBe("2026-03-01T12:00:00.000Z");
  });
});
