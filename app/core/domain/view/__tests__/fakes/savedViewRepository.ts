import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { SavedView } from "../../entity";
import type { SavedViewRepository } from "../../ports/savedViewRepository";
import {
  type SavedViewName,
  SavedViewName as SavedViewNameVO,
  type ViewKind,
} from "../../valueObject";

/**
 * Test-only in-memory `SavedViewRepository` for domain-service / usecase
 * unit tests. Models OCC semantics: `save` / `delete` compare the
 * captured `expectedVersion` against the persisted row's `version`,
 * raising a tagged failure when stale.
 *
 * This is intentionally co-located with the domain tests because the
 * project-wide policy is to validate transactional / OCC behaviour
 * against real D1 (integration). The fake here is scoped narrowly to
 * cover business-rule branches that do not depend on real concurrency.
 */
export class InMemoryOptimisticLockError extends Error {
  override readonly name = "InMemoryOptimisticLockError";
}

export class InMemorySavedViewRepository implements SavedViewRepository {
  private readonly byId = new Map<string, SavedView>();

  /** Direct seed for tests; bypasses OCC. */
  seed(view: SavedView): void {
    this.byId.set(view.id, view);
  }

  list(): SavedView[] {
    return [...this.byId.values()];
  }

  async insert(view: SavedView): Promise<void> {
    if (this.byId.has(view.id)) {
      throw new Error(`InMemorySavedViewRepository: duplicate id ${view.id}`);
    }
    this.byId.set(view.id, view);
  }

  async findById(id: string): Promise<Versioned<SavedView> | null> {
    const found = this.byId.get(id);
    if (found === undefined) {
      return null;
    }
    return {
      entity: found,
      expectedVersion: found.version as unknown as ExpectedVersion<SavedView>,
    };
  }

  async save(
    view: SavedView,
    expectedVersion: ExpectedVersion<SavedView>,
  ): Promise<void> {
    const existing = this.byId.get(view.id);
    if (existing === undefined) {
      throw new InMemoryOptimisticLockError(
        `InMemorySavedViewRepository.save: missing id ${view.id}`,
      );
    }
    if (
      (existing.version as unknown as number) !==
      (expectedVersion as unknown as number)
    ) {
      throw new InMemoryOptimisticLockError(
        `InMemorySavedViewRepository.save: stale token for id ${view.id}`,
      );
    }
    this.byId.set(view.id, view);
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<SavedView>,
  ): Promise<void> {
    const existing = this.byId.get(id);
    if (existing === undefined) {
      throw new InMemoryOptimisticLockError(
        `InMemorySavedViewRepository.delete: missing id ${id}`,
      );
    }
    if (
      (existing.version as unknown as number) !==
      (expectedVersion as unknown as number)
    ) {
      throw new InMemoryOptimisticLockError(
        `InMemorySavedViewRepository.delete: stale token for id ${id}`,
      );
    }
    this.byId.delete(id);
  }

  async findByOwner(
    ownerId: UserId,
    kind: ViewKind,
  ): Promise<readonly SavedView[]> {
    return [...this.byId.values()].filter(
      (v) => v.ownerId === ownerId && v.kind === kind,
    );
  }

  async findDefault(
    ownerId: UserId,
    kind: ViewKind,
  ): Promise<SavedView | null> {
    for (const v of this.byId.values()) {
      if (v.ownerId === ownerId && v.kind === kind && v.isDefault) {
        return v;
      }
    }
    return null;
  }

  async findByName(
    ownerId: UserId,
    kind: ViewKind,
    name: SavedViewName,
  ): Promise<SavedView | null> {
    for (const v of this.byId.values()) {
      if (
        v.ownerId === ownerId &&
        v.kind === kind &&
        SavedViewNameVO.equals(v.name, name)
      ) {
        return v;
      }
    }
    return null;
  }

  async findReferencingTag(tagId: TagId): Promise<readonly SavedView[]> {
    return [...this.byId.values()].filter((v) =>
      v.query.tagIds.includes(tagId),
    );
  }

  async findReferencingDirectory(
    directoryId: DirectoryId,
  ): Promise<readonly SavedView[]> {
    return [...this.byId.values()].filter(
      (v) => v.query.directoryId === directoryId,
    );
  }

  async findReferencingNote(noteId: NoteId): Promise<readonly SavedView[]> {
    return [...this.byId.values()].filter(
      (v) => v.query.referencingNoteId === noteId,
    );
  }
}
