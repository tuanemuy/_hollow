import type { InstanceSettingsRepository } from "@/core/domain/adminSettings/ports/instanceSettingsRepository";
import type { UserPromptOverrideRepository } from "@/core/domain/adminSettings/ports/userPromptOverrideRepository";
import type { EventDraft } from "@/core/domain/common/event";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import type { ExportJobRepository } from "@/core/domain/export/ports/exportJobRepository";
import type { CredentialStore } from "@/core/domain/identity/ports/credentialStore";
import type { UserRepository } from "@/core/domain/identity/ports/userRepository";
import type { VerificationChallenge } from "@/core/domain/identity/ports/verificationChallenge";
import type { IngestionJobRepository } from "@/core/domain/ingestion/ports/ingestionJobRepository";
import type { MediaAssetRepository } from "@/core/domain/media/ports/mediaAssetRepository";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteRevisionRepository } from "@/core/domain/note/ports/noteRevisionRepository";
import type { PublicationStateRepository } from "@/core/domain/publication/ports/publicationStateRepository";
import type { ShareLinkRepository } from "@/core/domain/publication/ports/shareLinkRepository";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import type { TagBlacklistRepository } from "@/core/domain/tag/ports/tagBlacklistRepository";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { SavedViewRepository } from "@/core/domain/view/ports/savedViewRepository";

/**
 * Repositories and ports the unit-of-work exposes to a usecase callback.
 *
 * All repository slots are required: the D1 adapter wires every port,
 * and usecases may dereference any slot without a defensive check.
 *
 * Cross-cutting ports (clock, id generation, logging) deliberately live
 * outside this context — they are injected at usecase construction time
 * and do not participate in transaction commit.
 *
 * `verificationChallenge` and `credentialStore` are included alongside
 * repositories because the Identity spec calls out token issuance /
 * consumption and credential purge as UoW-participating (so those rows
 * roll back atomically with the User mutation that motivated them).
 *
 * `indexJobRepository` is exposed for symmetry but search-index jobs are
 * dispatched out-of-band by the indexer worker; the slot exists so
 * usecases can enqueue jobs alongside the aggregate write that triggered
 * them.
 */
export interface UnitOfWorkContext {
  userRepository: UserRepository;
  directoryRepository: DirectoryRepository;
  noteRepository: NoteRepository;
  noteRevisionRepository: NoteRevisionRepository;
  tagRepository: TagRepository;
  tagBlacklistRepository: TagBlacklistRepository;
  publicationStateRepository: PublicationStateRepository;
  shareLinkRepository: ShareLinkRepository;
  ingestionJobRepository: IngestionJobRepository;
  mediaAssetRepository: MediaAssetRepository;
  exportJobRepository: ExportJobRepository;
  savedViewRepository: SavedViewRepository;
  instanceSettingsRepository: InstanceSettingsRepository;
  userPromptOverrideRepository: UserPromptOverrideRepository;
  indexJobRepository: IndexJobRepository;
  verificationChallenge: VerificationChallenge;
  credentialStore: CredentialStore;
  /**
   * Enqueue domain event drafts for outbox flush at commit time.
   *
   * Drafts are identity-less by design — `EventId` is minted by the UoW
   * implementation against the application's `IdGenerator` port and
   * attached as the draft is buffered. Domain code therefore never touches
   * id generation, and usecases never thread `idGenerator` through manually.
   */
  collectEvents(drafts: readonly EventDraft[]): void;
}

export interface UnitOfWorkProvider {
  run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}
