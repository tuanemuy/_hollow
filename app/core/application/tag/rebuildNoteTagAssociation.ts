import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagBlacklistRepository } from "@/core/domain/tag/ports/tagBlacklistRepository";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import { TagService } from "@/core/domain/tag/service";
import {
  type TagId as DomainTagId,
  TagName,
} from "@/core/domain/tag/valueObject";
import type { IdGenerator } from "../ports/idGenerator";

/**
 * Internal helper invoked by Note save / ingestion flows to resolve a
 * combined set of tag names (declared by the user + extracted from the
 * note body) into Tag ids.
 *
 * This is **not** a top-level usecase: it does not own a UoW. The
 * caller must already be inside `UnitOfWorkProvider.run` and pass the
 * tag-side repositories from the context so the resolve happens
 * atomically with the note write that triggered it.
 *
 * Returns the resolved tag ids in input order, with blacklisted /
 * invalid names omitted (see `TagService.resolveOrCreate`).
 */
export async function rebuildNoteTagAssociation(
  params: Readonly<{
    ownerId: UserId;
    declaredTagNames: readonly string[];
    extractedTagNames: readonly TagName[];
    now: Date;
    idGenerator: IdGenerator;
    tagRepository: TagRepository;
    tagBlacklistRepository: TagBlacklistRepository;
  }>,
): Promise<readonly DomainTagId[]> {
  const declared = params.declaredTagNames
    .map((raw) => safeName(raw))
    .filter((n): n is TagName => n !== null);
  const combined = dedupeNames([...declared, ...params.extractedTagNames]);

  return TagService.resolveOrCreate(
    params.ownerId,
    combined,
    () => params.idGenerator.next(),
    params.now,
    params.tagRepository,
    params.tagBlacklistRepository,
  );
}

function safeName(raw: string): TagName | null {
  try {
    return TagName.create(raw);
  } catch {
    return null;
  }
}

function dedupeNames(names: readonly TagName[]): readonly TagName[] {
  const seen = new Set<string>();
  const out: TagName[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
