import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ShareLink } from "../entity";
import type { ShareLinkId, ShareLinkTokenHash } from "../valueObject";

/**
 * Persistence port for the `ShareLink` aggregate.
 *
 * Mutations (issue / revoke / password change / failure counter) all go
 * through the OCC-enforced base contract:
 * - `insert` for first persistence (no token required)
 * - `findById` → `Versioned<ShareLink>` for read-with-intent-to-write
 * - `save` / `delete` consume the captured `ExpectedVersion<ShareLink>`
 *
 * Read-only projections (lookups by note id or token hash, counting for
 * quota enforcement) are exposed below without the OCC token; they
 * **must not** be used as the basis for a subsequent write.
 */
export interface ShareLinkRepository
  extends TransactionalRepository<ShareLink, ShareLinkId> {
  /**
   * Read-only lookup by the secret token's hash. Used by
   * `ResolveShareLink` to bind an incoming token to a stored link
   * without exposing the raw token at the storage layer.
   */
  findByTokenHash(hash: ShareLinkTokenHash): Promise<ShareLink | null>;

  /**
   * All links belonging to a note, including revoked ones. Used by
   * `PublicationService.revokeAllLinks` to cascade visibility changes
   * and by the owner-facing `ListShareLinks` usecase.
   */
  findByNoteId(noteId: NoteId): Promise<readonly ShareLink[]>;

  /**
   * Count for quota enforcement. `includeRevoked === true` returns the
   * lifetime count; `false` returns only currently-active links so
   * revoking a link frees one quota slot.
   */
  countByNoteId(noteId: NoteId, includeRevoked: boolean): Promise<number>;
}
