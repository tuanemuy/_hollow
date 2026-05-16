import type { ShareLink } from "@/core/domain/publication/entity";
import { type ShareLinkDTO, toShareLinkDTO } from "../dto/publication";

export {
  type PublicationStateDTO,
  type ShareLinkDTO,
  toPublicationStateDTO,
} from "../dto/publication";

/**
 * Build the public URL for a share link given the runtime app URL and
 * the raw (plaintext) token. The plaintext token is only available at
 * issue time; subsequent listings materialise the URL from the link id
 * via {@link shareLinkUrlFromId}.
 */
export function shareLinkUrlFromToken(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/share/${token}`;
}

/**
 * Build a stable id-keyed URL for a share link used by the owner-facing
 * listing (`ListShareLinks`), where the plaintext token is no longer
 * available. The presentation layer can surface this as a "copy link"
 * affordance that resolves to the canonical `/share/<token>` URL at the
 * routing layer.
 */
export function shareLinkUrlFromId(appUrl: string, linkId: string): string {
  return `${appUrl.replace(/\/$/, "")}/share/by-id/${linkId}`;
}

export function toShareLinkDTOFromToken(
  link: ShareLink,
  appUrl: string,
  rawToken: string,
): ShareLinkDTO {
  return toShareLinkDTO(link, shareLinkUrlFromToken(appUrl, rawToken));
}

export function toShareLinkDTOFromId(
  link: ShareLink,
  appUrl: string,
): ShareLinkDTO {
  return toShareLinkDTO(link, shareLinkUrlFromId(appUrl, link.id));
}
