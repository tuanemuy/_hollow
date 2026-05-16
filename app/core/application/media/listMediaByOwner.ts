import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { ServiceArgs } from "../types";
import { type MediaAssetDTO, projectMediaAsset } from "./view";

export type ListMediaByOwnerInput = Readonly<{
  actorUserId: UserId;
  limit: number;
  cursor: MediaAssetId | null;
}>;

export type ListMediaByOwnerOutput = Readonly<{
  assets: readonly MediaAssetDTO[];
  nextCursor: MediaAssetId | null;
}>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Owner-scoped media listing with cursor pagination. The repository
 * returns up to `limit + 1` rows; if the extra row is present, its id
 * becomes `nextCursor`. Each row is projected with a short-lived
 * presigned download URL.
 */
export async function listMediaByOwner({
  container,
  input,
}: ServiceArgs<ListMediaByOwnerInput>): Promise<ListMediaByOwnerOutput> {
  const limit = clamp(input.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);

  const rows = await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository }) =>
      mediaAssetRepository.findByOwner(input.actorUserId, {
        limit: limit + 1,
        ...(input.cursor === null ? {} : { cursor: input.cursor }),
      }),
  );

  const overflowed = rows.length > limit;
  const page = overflowed ? rows.slice(0, limit) : rows;
  const nextCursor =
    overflowed && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null;

  const assets = await Promise.all(
    page.map((asset) => projectMediaAsset(asset, container.objectStorage)),
  );

  return { assets, nextCursor };
}

function clamp(
  raw: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isInteger(raw) || raw <= 0) return fallback;
  if (raw < min) return min;
  if (raw > max) return max;
  return raw;
}
