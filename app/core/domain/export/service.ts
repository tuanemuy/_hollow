import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetRepository } from "@/core/domain/media/ports/mediaAssetRepository";
import type { ObjectStorage } from "@/core/domain/media/ports/objectStorage";
import type { Note } from "@/core/domain/note/entity";
import type {
  NoteOwnerListOpts,
  NoteRepository,
} from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { ExportJob } from "./entity";
import { ExportErrorCode } from "./errorCode";
import type { ArchiveBuilder } from "./ports/archiveBuilder";
import type { HtmlRenderer } from "./ports/htmlRenderer";
import type { MarkdownRenderer } from "./ports/markdownRenderer";
import type { PDFRenderer } from "./ports/pdfRenderer";
import type { ExportLimits } from "./valueObject";

/**
 * Bundle of artifact-side ports the service needs to assemble an
 * export. Kept as a single record so the call site doesn't grow a
 * positional-argument zoo as new renderers are added.
 */
export type ExportAssemblyDeps = Readonly<{
  noteRepo: NoteRepository;
  mediaRepo: MediaAssetRepository;
  storage: ObjectStorage;
  pdfRenderer: PDFRenderer;
  markdownRenderer: MarkdownRenderer;
  htmlRenderer: HtmlRenderer;
  archiveBuilder: ArchiveBuilder;
  /**
   * Design tokens (CSS variables, font URLs, etc.) injected into the
   * HTML wrapper so exports render without the live site's CSS
   * pipeline.
   */
  designTokens: Readonly<Record<string, string>>;
  /**
   * Layout helper for the object-storage key. The export usecase
   * decides the exact path (e.g. `exports/<userId>/<jobId>.zip`); the
   * service stays oblivious to that policy.
   */
  artifactKey: (job: ExportJob) => string;
  /** MIME type for the final upload. Defaults to `application/zip`. */
  artifactContentType?: string;
}>;

/**
 * Result returned from `assembleArtifact` — passed straight into
 * `ExportJob.complete` by the calling usecase.
 */
export type AssembledArtifact = Readonly<{
  key: string;
  size: number;
}>;

/**
 * Authorisation inputs for `assertCanAccess`. The maps are populated
 * by the caller (usecase) from owner + publication state so the
 * service stays free of repository round-trips.
 */
export type AccessAssertion = Readonly<{
  /** `null` for anonymous visitors. */
  viewerOwnerId: UserId | null;
  targetNoteIds: readonly NoteId[];
  visibilityMap: ReadonlyMap<NoteId, PublicationVisibility>;
  ownerMap: ReadonlyMap<NoteId, UserId>;
}>;

async function loadNotes(
  ids: readonly NoteId[],
  repo: NoteRepository,
): Promise<readonly Note[]> {
  const out: Note[] = [];
  for (const id of ids) {
    // `findById` returns a `Versioned<Note>` because the port enforces
    // OCC for write-intent reads. The service only reads notes, so the
    // captured token is dropped after extraction.
    const found = await repo.findById(id);
    if (found !== null) {
      out.push(found.entity);
    }
  }
  return out;
}

async function buildPdf(
  job: ExportJob,
  notes: readonly Note[],
  deps: ExportAssemblyDeps,
): Promise<ArrayBuffer> {
  if (job.options.pdfPaperSize === null) {
    // Defensive: entity factory rejects pdf jobs without a paper size,
    // but the dispatcher narrows here so the renderer call stays
    // type-safe.
    throw new BusinessRuleError(
      ExportErrorCode.InvalidPaperSize,
      "pdfPaperSize is required for pdf export",
    );
  }
  const wrapped = await deps.htmlRenderer.wrapForExport(joinHtml(notes), {
    includeFrontMatter: job.options.includeFrontMatter,
    frontMatter: mergedFrontMatter(notes),
    designTokens: deps.designTokens,
  });
  return deps.pdfRenderer.render(wrapped, {
    paper: job.options.pdfPaperSize,
    embedMedia: job.options.embedMedia,
    mediaResolver: async (id) => {
      const asset = await deps.mediaRepo.findById(id);
      if (asset === null) return null;
      try {
        return await deps.storage.get(asset.storageKey);
      } catch {
        return null;
      }
    },
  });
}

async function buildSingleHtml(
  job: ExportJob,
  notes: readonly Note[],
  deps: ExportAssemblyDeps,
): Promise<ArrayBuffer> {
  const wrapped = await deps.htmlRenderer.wrapForExport(joinHtml(notes), {
    includeFrontMatter: job.options.includeFrontMatter,
    frontMatter: mergedFrontMatter(notes),
    designTokens: deps.designTokens,
  });
  return new TextEncoder().encode(wrapped).buffer as ArrayBuffer;
}

async function buildSingleMarkdown(
  job: ExportJob,
  notes: readonly Note[],
  deps: ExportAssemblyDeps,
): Promise<ArrayBuffer> {
  const md = await deps.markdownRenderer.fromHtml(joinHtml(notes), {
    includeFrontMatter: job.options.includeFrontMatter,
    frontMatter: mergedFrontMatter(notes),
  });
  return new TextEncoder().encode(md).buffer as ArrayBuffer;
}

async function buildZip(
  job: ExportJob,
  notes: readonly Note[],
  deps: ExportAssemblyDeps,
): Promise<ArrayBuffer> {
  async function* entries() {
    for (const note of notes) {
      const base = noteFileBaseName(note);
      switch (job.format) {
        case "html": {
          const html = await deps.htmlRenderer.wrapForExport(note.contentHtml, {
            includeFrontMatter: job.options.includeFrontMatter,
            frontMatter: note.frontMatter,
            designTokens: deps.designTokens,
          });
          yield {
            path: `${base}.html`,
            bytes: new TextEncoder().encode(html).buffer as ArrayBuffer,
          };
          break;
        }
        case "markdown": {
          const md = await deps.markdownRenderer.fromHtml(note.contentHtml, {
            includeFrontMatter: job.options.includeFrontMatter,
            frontMatter: note.frontMatter,
          });
          yield {
            path: `${base}.md`,
            bytes: new TextEncoder().encode(md).buffer as ArrayBuffer,
          };
          break;
        }
        case "pdf": {
          if (job.options.pdfPaperSize === null) {
            throw new BusinessRuleError(
              ExportErrorCode.InvalidPaperSize,
              "pdfPaperSize is required for pdf export",
            );
          }
          const wrapped = await deps.htmlRenderer.wrapForExport(
            note.contentHtml,
            {
              includeFrontMatter: job.options.includeFrontMatter,
              frontMatter: note.frontMatter,
              designTokens: deps.designTokens,
            },
          );
          const pdf = await deps.pdfRenderer.render(wrapped, {
            paper: job.options.pdfPaperSize,
            embedMedia: job.options.embedMedia,
            mediaResolver: async (id) => {
              const asset = await deps.mediaRepo.findById(id);
              if (asset === null) return null;
              try {
                return await deps.storage.get(asset.storageKey);
              } catch {
                return null;
              }
            },
          });
          yield { path: `${base}.pdf`, bytes: pdf };
          break;
        }
      }
    }
  }
  return deps.archiveBuilder.createZip(entries());
}

// Concatenates the canonical HTML bodies of `notes` with a separator
// so the renderer sees one document. Adapters may prefer per-note
// fragments; this fallback keeps the single-file path total-render
// safe.
function joinHtml(notes: readonly Note[]): string {
  return notes.map((n) => n.contentHtml as unknown as string).join("\n");
}

// Picks the first note's front matter as the merged document's
// metadata. Multi-note exports that need richer merging should
// override `htmlRenderer` to inspect each note individually.
function mergedFrontMatter(notes: readonly Note[]): Note["frontMatter"] {
  const first = notes[0];
  if (first === undefined) {
    throw new BusinessRuleError(
      ExportErrorCode.ScopeTargetMismatch,
      "Cannot assemble artifact with zero notes",
    );
  }
  return first.frontMatter;
}

// Filesystem-safe file basename. Falls back to the note id when the
// slug is unusable so the archive never holds duplicates / illegal
// names.
function noteFileBaseName(note: Note): string {
  const raw = (note.slug as unknown as string) ?? "";
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").trim();
  return safe.length === 0 ? (note.id as unknown as string) : safe;
}

export const ExportService = {
  /**
   * Format-dispatched artifact assembly. The service:
   *
   *   1. Loads the target notes via `noteRepo`.
   *   2. Renders the bytes using the matching renderer / archive
   *      builder.
   *   3. Uploads the bytes through `storage` at `deps.artifactKey(job)`.
   *   4. Returns `{ key, size }` for the caller to pass into
   *      `ExportJob.complete`.
   *
   * The function never persists the `ExportJob` itself — state
   * transitions remain the calling usecase's responsibility.
   */
  async assembleArtifact(
    job: ExportJob,
    deps: ExportAssemblyDeps,
  ): Promise<AssembledArtifact> {
    const notes = await loadNotes(job.targetNoteIds, deps.noteRepo);
    if (notes.length === 0) {
      throw new BusinessRuleError(
        ExportErrorCode.ScopeTargetMismatch,
        "No notes resolved for export",
      );
    }
    let bytes: ArrayBuffer;
    let contentType: string;
    if (job.scope === "single") {
      switch (job.format) {
        case "html": {
          bytes = await buildSingleHtml(job, notes, deps);
          contentType = deps.artifactContentType ?? "text/html";
          break;
        }
        case "markdown": {
          bytes = await buildSingleMarkdown(job, notes, deps);
          contentType = deps.artifactContentType ?? "text/markdown";
          break;
        }
        case "pdf": {
          bytes = await buildPdf(job, notes, deps);
          contentType = deps.artifactContentType ?? "application/pdf";
          break;
        }
      }
    } else {
      bytes = await buildZip(job, notes, deps);
      contentType = deps.artifactContentType ?? "application/zip";
    }
    const key = deps.artifactKey(job);
    await deps.storage.put(key, bytes, contentType);
    return { key, size: bytes.byteLength };
  },

  /**
   * Resolves the concrete list of note ids the export should cover.
   * For `scope === 'view'` the embedded `viewQuery` snapshot is
   * re-executed against `noteRepo` (filtered against `tagRepo` when
   * tag predicates are present); otherwise the pre-resolved
   * `targetNoteIds` are returned verbatim.
   */
  async resolveTargetNotes(
    job: ExportJob,
    repos: { noteRepo: NoteRepository; tagRepo: TagRepository },
  ): Promise<readonly NoteId[]> {
    if (job.scope !== "view") {
      return job.targetNoteIds;
    }
    const query = job.viewQuery;
    if (query === null) {
      throw new BusinessRuleError(
        ExportErrorCode.ScopeTargetMismatch,
        "scope='view' requires a viewQuery snapshot",
      );
    }
    // `findByOwner` accepts the subset of filters the note repository
    // currently exposes (status / tagIds / dateRange). The remaining
    // snapshot dimensions (`directoryId`, `keyword`, `referencingNoteId`)
    // are post-filtered here so the service stays decoupled from any
    // future search-domain integration.
    // `exactOptionalPropertyTypes` rejects `prop: undefined`; build the
    // opts object piecewise so absent filters stay omitted rather than
    // explicitly `undefined`.
    const listOpts: NoteOwnerListOpts = {
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
      ...(query.tagIds.length > 0 ? { tagIds: query.tagIds } : {}),
      ...(query.dateRange !== null ? { dateRange: query.dateRange } : {}),
    };
    const ownerListing = await repos.noteRepo.findByOwner(
      job.ownerId,
      listOpts,
    );
    void repos.tagRepo;
    let pool: readonly Note[] = ownerListing;
    if (query.referencingNoteId !== null) {
      const referrers = await repos.noteRepo.findReferrers(
        query.referencingNoteId,
      );
      const allowed = new Set(referrers.map((n) => n.id));
      pool = pool.filter((n) => allowed.has(n.id));
    }
    if (query.directoryId !== null) {
      const target = query.directoryId;
      pool = pool.filter((n) => n.directoryId === target);
    }
    if (query.keyword !== null) {
      const needle = query.keyword.toLowerCase();
      pool = pool.filter((n) => {
        const haystack = `${n.title as unknown as string} ${n.contentHtml as unknown as string}`;
        return haystack.toLowerCase().includes(needle);
      });
    }
    return pool.map((n) => n.id);
  },

  /**
   * Quota guard. Compares `currentUserUsage` against the configured
   * caps in `limits`; throws `BusinessRuleError('export_quota_exceeded')`
   * when either is exceeded. The exact semantic of "usage" (jobs
   * today / concurrent jobs) is decided by the caller — both caps
   * are treated as upper bounds.
   */
  enforceQuota(
    _job: ExportJob,
    currentUserUsage: number,
    limits: ExportLimits,
  ): void {
    if (
      currentUserUsage >= limits.maxConcurrentJobs ||
      currentUserUsage >= limits.maxJobsPerDay
    ) {
      throw new BusinessRuleError(
        ExportErrorCode.QuotaExceeded,
        `Export quota exceeded (usage=${currentUserUsage}, concurrent=${limits.maxConcurrentJobs}, daily=${limits.maxJobsPerDay})`,
      );
    }
  },

  /**
   * Authorisation guard.
   *
   * - Anonymous visitors (`viewerOwnerId === null`) may export only
   *   when every target note is `public`.
   * - Bulk scopes (`multiple` / `view`) require an authenticated
   *   viewer who owns every target note.
   * - Single-note exports by an authenticated user are allowed when
   *   the viewer owns the note, or the note is `public` / `unlisted`
   *   (consistent with the read-side visibility model).
   *
   * The function looks up each target via `visibilityMap` / `ownerMap`;
   * missing entries are treated as private + unowned and therefore
   * rejected. Violations raise `BusinessRuleError('export_unauthorized')`.
   */
  assertCanAccess(args: AccessAssertion): void {
    const { viewerOwnerId, targetNoteIds, visibilityMap, ownerMap } = args;
    const isBulk = targetNoteIds.length > 1;

    if (viewerOwnerId === null) {
      if (isBulk) {
        throw new BusinessRuleError(
          ExportErrorCode.Unauthorized,
          "Anonymous viewers cannot perform bulk exports",
        );
      }
      for (const id of targetNoteIds) {
        const v = visibilityMap.get(id);
        if (v !== "public") {
          throw new BusinessRuleError(
            ExportErrorCode.Unauthorized,
            `Anonymous export blocked: note ${id} is not public`,
          );
        }
      }
      return;
    }

    if (isBulk) {
      for (const id of targetNoteIds) {
        const owner = ownerMap.get(id);
        if (owner === undefined || owner !== viewerOwnerId) {
          throw new BusinessRuleError(
            ExportErrorCode.Unauthorized,
            `Bulk export blocked: note ${id} is not owned by viewer`,
          );
        }
      }
      return;
    }

    // single-note, authenticated viewer
    for (const id of targetNoteIds) {
      const owner = ownerMap.get(id);
      if (owner !== undefined && owner === viewerOwnerId) {
        continue;
      }
      const v = visibilityMap.get(id);
      if (v === "public" || v === "unlisted") {
        continue;
      }
      throw new BusinessRuleError(
        ExportErrorCode.Unauthorized,
        `Export blocked: note ${id} is not viewable by ${viewerOwnerId}`,
      );
    }
  },
};
