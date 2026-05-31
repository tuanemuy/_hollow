import type { UserId as DomainUserId } from "@/core/domain/identity/valueObject";
import type { TagListOpts } from "@/core/domain/tag/ports/tagRepository";
import type { UserId } from "../dto/identity";
import type { ServiceArgs } from "../types";
import { type TagView, toTagView } from "./view";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type ListTagsInput = {
  actorUserId: UserId;
  limit?: number;
  cursor?: string | null;
  query?: string;
  sort?: "name" | "noteCount" | "createdAt";
  order?: "asc" | "desc";
};

export type ListTagsOutput = {
  tags: readonly TagView[];
  nextCursor: string | null;
};

/**
 * Cursor is an opaque non-negative integer offset encoded as a decimal
 * string. The repository is offset-based per `TagListOpts`, so encoding
 * the offset directly is the simplest faithful projection.
 *
 * The transport boundary is responsible for shape validation (numeric
 * range, parseable cursor); this usecase coerces malformed input to the
 * defaults rather than throwing, matching the "trust the static type"
 * invariant for application code.
 */
export async function listTags({
  container,
  input,
}: ServiceArgs<ListTagsInput>): Promise<ListTagsOutput> {
  const limit = clampLimit(input.limit);
  const offset = decodeCursor(input.cursor ?? null);
  const ownerId = input.actorUserId as unknown as DomainUserId;

  const opts: TagListOpts = {
    limit: limit + 1,
    offset,
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(input.sort === undefined ? {} : { sort: input.sort }),
    ...(input.order === undefined ? {} : { order: input.order }),
  };

  const entries = await container.unitOfWorkProvider.run(({ tagRepository }) =>
    tagRepository.findByOwner(ownerId, opts),
  );

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;
  const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

  return {
    tags: page.map((entry) => toTagView(entry.tag, entry.noteCount)),
    nextCursor,
  };
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(value, MAX_LIMIT);
}

function decodeCursor(cursor: string | null): number {
  if (cursor === null || cursor === "") return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function encodeCursor(offset: number): string {
  return String(offset);
}
