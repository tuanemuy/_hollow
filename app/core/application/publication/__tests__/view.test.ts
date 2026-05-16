import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState, ShareLink } from "@/core/domain/publication/entity";
import {
  shareLinkUrlFromId,
  shareLinkUrlFromToken,
  toPublicationStateDTO,
  toShareLinkDTOFromId,
  toShareLinkDTOFromToken,
} from "../view";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const OWNER_ID = "00000000-0000-7000-a000-000000000001" as UserId;
const TOKEN_HASH = "0123456789abcdef0123456789abcdef";
const noteIdRaw = (n: number) =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const shareLinkIdRaw = (n: number) =>
  `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`;

describe("shareLinkUrlFromToken", () => {
  it("composes `${appUrl}/share/<token>` and strips a trailing slash from appUrl", () => {
    expect(shareLinkUrlFromToken("https://example.com", "abc")).toBe(
      "https://example.com/share/abc",
    );
    expect(shareLinkUrlFromToken("https://example.com/", "abc")).toBe(
      "https://example.com/share/abc",
    );
  });
});

describe("shareLinkUrlFromId", () => {
  it("composes `${appUrl}/share/by-id/<id>` and strips a trailing slash", () => {
    expect(shareLinkUrlFromId("https://example.com", "abc")).toBe(
      "https://example.com/share/by-id/abc",
    );
    expect(shareLinkUrlFromId("https://example.com/", "abc")).toBe(
      "https://example.com/share/by-id/abc",
    );
  });
});

describe("toPublicationStateDTO", () => {
  it("maps an entity to a flat DTO with serialized publishedAt", () => {
    const state = PublicationState.create(
      { noteId: noteIdRaw(1), ownerId: OWNER_ID },
      T0,
    );
    const { entity: pub } = PublicationState.changeVisibility(
      state,
      "public",
      at(10),
    );
    const dto = toPublicationStateDTO(pub);
    expect(dto.visibility).toBe("public");
    expect(dto.publishedAt).not.toBeNull();
    expect(dto.noteId as unknown as string).toBe(noteIdRaw(1));
  });

  it("emits null publishedAt for a private state", () => {
    const state = PublicationState.create(
      { noteId: noteIdRaw(2), ownerId: OWNER_ID },
      T0,
    );
    const dto = toPublicationStateDTO(state);
    expect(dto.visibility).toBe("private");
    expect(dto.publishedAt).toBeNull();
  });
});

describe("toShareLinkDTOFromToken / toShareLinkDTOFromId", () => {
  const createLink = (passwordHash: string | null = null) =>
    ShareLink.create(
      {
        id: shareLinkIdRaw(1),
        noteId: NoteId.create(noteIdRaw(1)),
        ownerId: OWNER_ID,
        tokenHash: TOKEN_HASH,
        passwordHash,
      },
      T0,
    ).entity;

  it("reports hasPassword=false when passwordHash is null", () => {
    const link = createLink(null);
    const dto = toShareLinkDTOFromId(link, "https://example.com");
    expect(dto.hasPassword).toBe(false);
    expect(dto.status).toBe("active");
    expect(dto.url).toBe(`https://example.com/share/by-id/${link.id}`);
  });

  it("reports hasPassword=true when passwordHash is non-null", () => {
    const link = createLink("argon2-hash");
    const dto = toShareLinkDTOFromId(link, "https://example.com");
    expect(dto.hasPassword).toBe(true);
  });

  it("never echoes the password hash field in the DTO", () => {
    const link = createLink("argon2-hash");
    const dto = toShareLinkDTOFromId(link, "https://example.com");
    expect(JSON.stringify(dto).includes("argon2-hash")).toBe(false);
  });

  it("toShareLinkDTOFromToken uses the raw token in the URL", () => {
    const link = createLink(null);
    const dto = toShareLinkDTOFromToken(link, "https://example.com", "raw-tok");
    expect(dto.url).toBe("https://example.com/share/raw-tok");
  });
});
