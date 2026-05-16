import { FakeIdGenerator } from "@/core/application/__tests__/fakes/fakeIdGenerator";
import type { RequestContainer } from "@/core/application/di/types";
import type {
  UnitOfWorkContext,
  UnitOfWorkProvider,
} from "@/core/application/execution/unitOfWork";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type { Directory } from "@/core/domain/directory/entity";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { Tag } from "@/core/domain/tag/entity";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { TagId } from "@/core/domain/tag/valueObject";
import { InMemorySavedViewRepository } from "@/core/domain/view/__tests__/fakes/savedViewRepository";

/**
 * Minimal in-process UoW for view-usecase unit tests. Real concurrency /
 * OCC semantics live in the integration suite (D1 binding); this fake
 * only models the "callback receives a context with repositories" shape
 * required by the application service contract.
 *
 * `collectEvents` is a no-op: view usecases do not publish domain events.
 * If a future usecase starts emitting them, swap this for a recording
 * version inside the test.
 */
export class FakeUnitOfWorkProvider implements UnitOfWorkProvider {
  constructor(private readonly ctx: UnitOfWorkContext) {}

  async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}

export type DirSeed = readonly DirectoryId[];
export type TagSeed = readonly TagId[];
export type NoteSeed = readonly NoteId[];

export function makeDirRepoStub(seed: DirSeed): DirectoryRepository {
  const set = new Set<string>(seed);
  return {
    async findById(id: DirectoryId) {
      if (!set.has(id)) return null;
      return {
        entity: { id } as unknown as Directory,
        expectedVersion: 0 as never,
      };
    },
  } as unknown as DirectoryRepository;
}

export function makeTagRepoStub(seed: TagSeed): TagRepository {
  const present = new Set<string>(seed);
  return {
    async findByIds(ids: readonly TagId[]) {
      return ids
        .filter((id) => present.has(id))
        .map((id) => ({ id }) as unknown as Tag);
    },
  } as unknown as TagRepository;
}

export function makeNoteRepoStub(seed: NoteSeed): NoteRepository {
  const set = new Set<string>(seed);
  return {
    async findById(id: NoteId) {
      if (!set.has(id)) return null;
      return {
        entity: { id } as unknown as Note,
        expectedVersion: 0 as never,
      };
    },
  } as unknown as NoteRepository;
}

export type ViewTestContainer = RequestContainer & {
  savedViewRepository: InMemorySavedViewRepository;
};

export type ViewTestContainerOptions = Readonly<{
  now?: Date;
  idStart?: number;
  existingDirIds?: DirSeed;
  existingTagIds?: TagSeed;
  existingNoteIds?: NoteSeed;
}>;

/**
 * Build a `RequestContainer`-shaped object that view usecases can
 * accept. Every slot not exercised by view usecases is left as an
 * `as never` placeholder; touching it inside a test indicates a
 * mistake in test setup (intended to throw rather than mask bugs).
 */
export function createViewTestContainer(
  opts: ViewTestContainerOptions = {},
): ViewTestContainer {
  const savedViewRepository = new InMemorySavedViewRepository();
  const directoryRepository = makeDirRepoStub(opts.existingDirIds ?? []);
  const tagRepository = makeTagRepoStub(opts.existingTagIds ?? []);
  const noteRepository = makeNoteRepoStub(opts.existingNoteIds ?? []);

  const ctx = {
    savedViewRepository,
    directoryRepository,
    tagRepository,
    noteRepository,
    collectEvents: () => {},
  } as unknown as UnitOfWorkContext;

  const fixedNow = opts.now ?? new Date(0);
  const clock: Clock = { now: () => fixedNow };
  const idGenerator: IdGenerator = new FakeIdGenerator(opts.idStart ?? 1);

  const container = {
    clock,
    idGenerator,
    unitOfWorkProvider: new FakeUnitOfWorkProvider(ctx),
    savedViewRepository,
    // Every other slot is unused by view usecases; reach for it inside a
    // test only after extending these stubs.
  } as unknown as ViewTestContainer;

  return container;
}
