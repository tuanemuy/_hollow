import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for
 * `D1PublicationStateRepository.listPublicNoteIdsByOwnerSorted` (Issue #605).
 * Covers published_at ascending/descending order, NULL exclusion, the
 * note_id tie-break, total accuracy under a trashed-note relay-lag row, the
 * candidate-set (tag AND) composition with an independent total, and a
 * candidate set larger than the D1 host-variable cap (chunked path, #605
 * W-001).
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7fa-${block}-7000-8000-0000000000${tail}`;
};

const iso = (s: string): string => new Date(s).toISOString();

async function seedUser(
  container: TestContainer,
  username: string,
): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: username,
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username,
    role: "member",
    banned: 0,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `dir-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  opts: {
    visibility: "private" | "unlisted" | "public";
    publishedAt: string | null;
    status?: "active" | "trashed";
  },
): Promise<NoteId> {
  const noteId = nextId(0x03);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id: noteId,
    ownerId,
    directoryId,
    slug: `note-${noteId.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility: opts.visibility,
    publishedAt: opts.publishedAt === null ? null : iso(opts.publishedAt),
    updatedAt: TZ,
    version: 0,
  });
  return noteId as NoteId;
}

describe("D1PublicationStateRepository.listPublicNoteIdsByOwnerSorted (integration, #605)", () => {
  it("orders public notes by published_at, both directions, with note_id tie-break", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-sort");
    const dir = await seedDirectory(container, owner);

    const jan = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    const mar = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-03-01T00:00:00.000Z",
    });
    const feb = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-02-01T00:00:00.000Z",
    });

    const desc = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 20,
          offset: 0,
        }),
    );
    expect(desc.total).toBe(3);
    expect(desc.noteIds).toEqual([mar, feb, jan]);

    const asc = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "asc",
          limit: 20,
          offset: 0,
        }),
    );
    expect(asc.noteIds).toEqual([jan, feb, mar]);
  });

  it("breaks published_at ties deterministically by note_id (asc)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-tie");
    const dir = await seedDirectory(container, owner);

    const a = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-05-01T00:00:00.000Z",
    });
    const b = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-05-01T00:00:00.000Z",
    });

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 20,
          offset: 0,
        }),
    );
    // Same published_at → ascending note_id tie-break regardless of order.
    const [lo, hi] = [a, b].sort();
    expect(result.noteIds).toEqual([lo, hi]);
  });

  it("excludes private / unlisted / null-published rows", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-excl");
    const dir = await seedDirectory(container, owner);

    const pub = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    await seedNote(container, owner, dir, {
      visibility: "private",
      publishedAt: null,
    });
    await seedNote(container, owner, dir, {
      visibility: "unlisted",
      publishedAt: null,
    });

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 20,
          offset: 0,
        }),
    );
    expect(result.total).toBe(1);
    expect(result.noteIds).toEqual([pub]);
  });

  it("does not inflate total when a public row points at a trashed note (P-002)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-trash");
    const dir = await seedDirectory(container, owner);

    const live = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-02-01T00:00:00.000Z",
    });
    // Relay-lag row: visibility still public, note already trashed.
    await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-03-01T00:00:00.000Z",
      status: "trashed",
    });

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 20,
          offset: 0,
        }),
    );
    // The trashed note must drop out of both the page and the total.
    expect(result.total).toBe(1);
    expect(result.noteIds).toEqual([live]);
  });

  it("pages the window independently of the total", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-page");
    const dir = await seedDirectory(container, owner);

    const ids: NoteId[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await seedNote(container, owner, dir, {
          visibility: "public",
          publishedAt: `2024-0${i + 1}-01T00:00:00.000Z`,
        }),
      );
    }
    const [jan, feb, mar] = ids;

    const page1 = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 2,
          offset: 0,
        }),
    );
    expect(page1.total).toBe(3);
    expect(page1.noteIds).toEqual([mar, feb]);

    const page2 = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 2,
          offset: 2,
        }),
    );
    expect(page2.total).toBe(3);
    expect(page2.noteIds).toEqual([jan]);
  });

  it("constrains to the candidate set (tag AND) with an independent total", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-cand");
    const dir = await seedDirectory(container, owner);

    const a = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    const b = await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-02-01T00:00:00.000Z",
    });
    // Not in the candidate set — must not count or appear.
    await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-03-01T00:00:00.000Z",
    });

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 1,
          offset: 0,
          noteIds: [a, b],
        }),
    );
    expect(result.total).toBe(2);
    expect(result.noteIds).toEqual([b]);
  });

  it("handles a candidate set larger than the D1 host-variable cap (chunked, #605 W-001)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-bigcand");
    const dir = await seedDirectory(container, owner);

    // 120 candidates > SAFE_CHUNK_SIZE (90): a single `note_id IN (...)` would
    // overflow the host-variable cap, so the adapter must chunk + merge.
    // Each note gets a distinct published_at so the full order is checkable.
    const candidates: NoteId[] = [];
    const expectedAscOrder: NoteId[] = [];
    const CANDIDATE_COUNT = 120;
    for (let i = 0; i < CANDIDATE_COUNT; i++) {
      // 2024-01-01 + i days → strictly increasing, NULL-free published_at.
      const day = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
      const id = await seedNote(container, owner, dir, {
        visibility: "public",
        publishedAt: day.toISOString(),
      });
      candidates.push(id);
      expectedAscOrder.push(id);
    }
    // A public note the owner has but which is NOT a candidate: must neither
    // count nor appear, proving the intersection holds across chunks.
    await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2030-01-01T00:00:00.000Z",
    });

    const expectedDescOrder = [...expectedAscOrder].reverse();

    const desc = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 10,
          offset: 0,
          noteIds: candidates,
        }),
    );
    expect(desc.total).toBe(CANDIDATE_COUNT);
    expect(desc.noteIds).toEqual(expectedDescOrder.slice(0, 10));

    // A later page still slices the same merged population by published_at.
    const descPage3 = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 10,
          offset: 20,
          noteIds: candidates,
        }),
    );
    expect(descPage3.total).toBe(CANDIDATE_COUNT);
    expect(descPage3.noteIds).toEqual(expectedDescOrder.slice(20, 30));

    const asc = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "asc",
          limit: 10,
          offset: 0,
          noteIds: candidates,
        }),
    );
    expect(asc.total).toBe(CANDIDATE_COUNT);
    expect(asc.noteIds).toEqual(expectedAscOrder.slice(0, 10));
  });

  it("short-circuits an empty candidate set to an empty result", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "owner-empty-cand");
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, {
      visibility: "public",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.listPublicNoteIdsByOwnerSorted(owner, {
          order: "desc",
          limit: 20,
          offset: 0,
          noteIds: [],
        }),
    );
    expect(result.total).toBe(0);
    expect(result.noteIds).toEqual([]);
  });
});
