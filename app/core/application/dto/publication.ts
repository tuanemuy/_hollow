import type {
  PublicationState,
  ShareLink,
} from "@/core/domain/publication/entity";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";

export type Visibility = "private" | "unlisted" | "public";

export type PublicationStateDTO = Readonly<{
  noteId: string;
  visibility: Visibility;
  publishedAt: Instant | null;
}>;

/**
 * Share link projection.
 *
 * `hasPassword` is a derived boolean (`passwordHash !== null`); the
 * raw hash never leaves the domain. `url` is materialised by the usecase
 * from the token + a host config, since the domain stores only the
 * hashed token.
 */
export type ShareLinkDTO = Readonly<{
  id: string;
  noteId: string;
  hasPassword: boolean;
  status: "active" | "revoked";
  createdAt: Instant;
  revokedAt: Instant | null;
  lastAccessedAt: Instant | null;
  url: string;
}>;

export function toPublicationStateDTO(
  state: PublicationState,
): PublicationStateDTO {
  return {
    noteId: state.noteId,
    visibility: state.visibility,
    publishedAt: toInstantOrNull(state.publishedAt),
  };
}

/**
 * Share-link DTO is built with a resolved URL because the domain only
 * stores `tokenHash`. The caller (usecase) supplies the URL it materialised
 * out of the raw token (available exactly once at issue time) or out of a
 * subsequent lookup keyed by the share-link id.
 */
export function toShareLinkDTO(link: ShareLink, url: string): ShareLinkDTO {
  return {
    id: link.id,
    noteId: link.noteId,
    hasPassword: link.passwordHash !== null,
    status: link.status,
    createdAt: toInstant(link.createdAt),
    revokedAt: toInstantOrNull(link.revokedAt),
    lastAccessedAt: toInstantOrNull(link.lastAccessedAt),
    url,
  };
}
