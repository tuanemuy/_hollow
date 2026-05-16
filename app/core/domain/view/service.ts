import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { SavedView } from "./entity";
import { ViewErrorCode } from "./errorCode";
import type { SavedViewRepository } from "./ports/savedViewRepository";
import {
  BrokenConditionMarker,
  type SavedViewId,
  type SavedViewName,
  type ViewKind,
} from "./valueObject";

/**
 * Domain service for `SavedView` invariants that span the aggregate
 * boundary — per-(owner, kind) name uniqueness, single-default
 * enforcement, and reference-integrity scanning against external
 * aggregates (Tag / Directory / Note).
 *
 * Each method is a static helper rather than a class so the service
 * stays pure-functional and trivially mockable. Aggregate-level
 * invariants (state transitions, version bumps) live on the entity;
 * cross-aggregate / cross-tree invariants land here.
 */
export const SavedViewService = {
  /**
   * Reject creating / renaming a view to a name that already exists
   * for the same `(ownerId, kind)` pair. Name equality is
   * case-insensitive (see `SavedViewName.equals`). `exceptId` is
   * non-null for rename flows so the view being mutated does not match
   * itself.
   */
  async assertNameUnique(
    ownerId: UserId,
    kind: ViewKind,
    name: SavedViewName,
    exceptId: SavedViewId | null,
    repo: SavedViewRepository,
  ): Promise<void> {
    const existing = await repo.findByName(ownerId, kind, name);
    if (existing === null) {
      return;
    }
    if (exceptId !== null && existing.id === exceptId) {
      return;
    }
    throw new BusinessRuleError(
      ViewErrorCode.NameConflict,
      `Saved view named "${name}" already exists`,
    );
  },

  /**
   * Ensure at most one view is flagged as default for the given
   * `(ownerId, kind)` pair. If a different view is currently default,
   * unmark it and persist via `repo.save` so the caller can then mark
   * `targetId` (or a freshly-created view) as the new default.
   *
   * `targetId === null` is the "clearing the slot entirely" case used
   * before deleting the current default.
   *
   * The OCC token captured at read time is threaded through `save` so
   * concurrent default toggles surface as `ConflictError` rather than
   * a lost update.
   */
  async ensureSingleDefault(
    ownerId: UserId,
    kind: ViewKind,
    targetId: SavedViewId | null,
    now: Date,
    repo: SavedViewRepository,
  ): Promise<void> {
    const current = await repo.findDefault(ownerId, kind);
    if (current === null) {
      return;
    }
    if (targetId !== null && current.id === targetId) {
      return;
    }
    const versioned = await repo.findById(current.id);
    if (versioned === null) {
      // Concurrently deleted — nothing to unmark.
      return;
    }
    const updated: SavedView = {
      ...versioned.entity,
      isDefault: false,
      updatedAt: now,
    };
    await repo.save(updated, versioned.expectedVersion);
  },

  /**
   * Scan `view.query` for references whose target no longer exists in
   * its owning aggregate and return a fresh marker batch. The marker's
   * `lastSeenAt` is set to `now` so the entity can decide whether to
   * merge or replace existing markers via `markBroken`.
   *
   * `directoryId` is checked even when the directory belongs to a
   * different owner — the saved-view contract only cares that the
   * referenced entity still exists; ownership / visibility filtering
   * is layered on top by the usecase that surfaces the view.
   */
  async detectBrokenConditions(
    view: SavedView,
    now: Date,
    repos: {
      dirRepo: DirectoryRepository;
      tagRepo: TagRepository;
      noteRepo: NoteRepository;
    },
  ): Promise<readonly BrokenConditionMarker[]> {
    const markers: BrokenConditionMarker[] = [];

    if (view.query.directoryId !== null) {
      const dir = await repos.dirRepo.findById(view.query.directoryId);
      if (dir === null) {
        markers.push(
          BrokenConditionMarker.directory(view.query.directoryId, now),
        );
      }
    }

    if (view.query.tagIds.length > 0) {
      const found = await repos.tagRepo.findByIds(view.query.tagIds);
      const foundIds = new Set<string>();
      for (const tag of found) {
        foundIds.add(tag.id);
      }
      for (const tagId of view.query.tagIds) {
        if (!foundIds.has(tagId)) {
          markers.push(BrokenConditionMarker.tag(tagId, now));
        }
      }
    }

    if (view.query.referencingNoteId !== null) {
      const note = await repos.noteRepo.findById(view.query.referencingNoteId);
      if (note === null) {
        markers.push(
          BrokenConditionMarker.note(view.query.referencingNoteId, now),
        );
      }
    }

    return markers;
  },
};
