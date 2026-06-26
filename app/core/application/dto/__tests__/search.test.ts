import { describe, expect, it } from "vitest";
import { UserId, Username } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import {
  SearchHighlightedTitle,
  type SearchHit,
  SearchScore,
  SearchSnippet,
  Visibility,
} from "@/core/domain/search/valueObject";
import { toSearchHitDTO } from "../search";

const hit: SearchHit = {
  noteId: NoteId.create("00000000-0000-7000-8000-000000000001"),
  ownerId: UserId.create("00000000-0000-7000-9000-000000000001"),
  username: Username.create("alice"),
  title: SearchHighlightedTitle.create("hit"),
  snippet: SearchSnippet.create("..."),
  tagNames: ["ai"],
  score: SearchScore.create(1),
  visibility: Visibility.create("public"),
  updatedAt: new Date("2026-05-14T09:24:00.000Z"),
};

describe("toSearchHitDTO", () => {
  it("projects updatedAt as an ISO 8601 instant", () => {
    const dto = toSearchHitDTO(hit);
    expect(dto.updatedAt).toBe("2026-05-14T09:24:00.000Z");
  });

  it("projects the remaining hit fields structurally", () => {
    const dto = toSearchHitDTO(hit);
    expect(dto).toEqual({
      noteId: "00000000-0000-7000-8000-000000000001",
      ownerId: "00000000-0000-7000-9000-000000000001",
      username: "alice",
      title: "hit",
      snippet: "...",
      tagNames: ["ai"],
      score: 1,
      visibility: "public",
      updatedAt: "2026-05-14T09:24:00.000Z",
    });
  });
});
