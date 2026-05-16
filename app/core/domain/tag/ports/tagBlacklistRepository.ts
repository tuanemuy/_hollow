import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagBlacklistEntry, TagName } from "../valueObject";

/**
 * Persistence port for the tag blacklist.
 *
 * Entries are value objects identified by `(ownerId, name)` and carry
 * no version of their own — there is no OCC for this port. The
 * adapter is expected to upsert by primary key on `add` and to be a
 * no-op when the same entry is added twice.
 */
export interface TagBlacklistRepository {
  isBlacklisted(ownerId: UserId, name: TagName): Promise<boolean>;
  add(entry: TagBlacklistEntry): Promise<void>;
  remove(ownerId: UserId, name: TagName): Promise<void>;
  listByOwner(ownerId: UserId): Promise<readonly TagBlacklistEntry[]>;
}
