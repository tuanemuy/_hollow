import { describe, expect, it } from "vitest";
import { User } from "@/core/domain/identity/entity";
import type { SessionRecord } from "@/core/domain/identity/ports/sessionService";
import { toSessionDTO, toUserDTO } from "../identity";

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

const sessionRecord = (
  overrides: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: rawId(2),
  token: "session-token-abc",
  userAgent: "Mozilla/5.0",
  ipAddress: "192.0.2.41",
  createdAt: new Date("2026-05-14T09:24:00.000Z"),
  updatedAt: new Date("2026-05-14T09:24:00.000Z"),
  expiresAt: new Date("2026-06-13T09:24:00.000Z"),
  ...overrides,
});

describe("toSessionDTO", () => {
  it("does not expose the token on the DTO", () => {
    const dto = toSessionDTO(sessionRecord(), "session-token-abc");
    expect(dto).not.toHaveProperty("token");
    expect(JSON.stringify(dto)).not.toContain("session-token-abc");
  });

  it("sets isCurrent=true when the token matches currentSessionToken", () => {
    const dto = toSessionDTO(sessionRecord({ token: "match-me" }), "match-me");
    expect(dto.isCurrent).toBe(true);
  });

  it("sets isCurrent=false when the token does not match", () => {
    const dto = toSessionDTO(
      sessionRecord({ token: "this-one" }),
      "a-different-token",
    );
    expect(dto.isCurrent).toBe(false);
  });

  it("sets isCurrent=false for every row when currentSessionToken is null", () => {
    const dto = toSessionDTO(sessionRecord(), null);
    expect(dto.isCurrent).toBe(false);
  });

  it("projects timestamps as ISO instants and passes through nullable fields", () => {
    const dto = toSessionDTO(
      sessionRecord({ userAgent: null, ipAddress: null }),
      null,
    );
    expect(dto.createdAt).toBe("2026-05-14T09:24:00.000Z");
    expect(dto.updatedAt).toBe("2026-05-14T09:24:00.000Z");
    expect(dto.expiresAt).toBe("2026-06-13T09:24:00.000Z");
    expect(dto.userAgent).toBeNull();
    expect(dto.ipAddress).toBeNull();
  });
});
