import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { TagMergeJob } from "../mergeJob/entity";
import type { TagMergeJobId } from "../mergeJob/valueObject";

/**
 * `TagMergeJobRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<TagMergeJob>` and adds nothing else.
 *
 * The progress banner polls a single self-owned job by id
 * (`getTagMergeJob` → `findById` + `assertOwnedBy`), so there is no
 * owner-scoped listing on this port — a banner never enumerates active
 * jobs (plan coverage P-001 / S-005).
 */
export interface TagMergeJobRepository
  extends TransactionalRepository<TagMergeJob> {}

/**
 * Reference-type alias kept for parity with other aggregates in this
 * codebase that re-export their id from the port module for adapter
 * convenience.
 */
export type { TagMergeJobId };
