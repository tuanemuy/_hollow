import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import type { UserPromptOverride } from "../entity";
import type { UserId } from "../valueObject";

/**
 * Repository for `UserPromptOverride`. Keyed by `ownerId` rather than a
 * separate id — each user has at most one override row.
 *
 * Lookups go through `findByOwner`, which (like `findById` on
 * `TransactionalRepository`) is the only construction site for the OCC
 * token. Writes must thread the captured `ExpectedVersion<UserPromptOverride>`
 * — "read then write without observing the version" is therefore a type
 * error.
 */
export interface UserPromptOverrideRepository {
  findByOwner(ownerId: UserId): Promise<Versioned<UserPromptOverride> | null>;
  insert(entity: UserPromptOverride): Promise<void>;
  save(
    entity: UserPromptOverride,
    expectedVersion: ExpectedVersion<UserPromptOverride>,
  ): Promise<void>;
  delete(
    ownerId: UserId,
    expectedVersion: ExpectedVersion<UserPromptOverride>,
  ): Promise<void>;
}
