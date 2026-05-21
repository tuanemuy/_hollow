export const PublicationErrorCode = {
  InvalidShareLinkId: "publication_invalid_share_link_id",
  InvalidVisibility: "publication_invalid_visibility",
  InvalidShareLinkStatus: "publication_invalid_share_link_status",
  InvalidTokenHash: "publication_invalid_token_hash",
  ShareLinkPasswordTooShort: "share_link_password_too_short",
  ShareLinkPasswordTooLong: "share_link_password_too_long",
  InvalidFailedAttempts: "publication_invalid_failed_attempts",
  InvariantPrivatePublishedAt: "publication_invariant_private_published_at",
  ShareLinkRevoked: "share_link_revoked",
  ShareLinkQuotaExceeded: "share_link_quota_exceeded",
  MediaNotOwned: "media_not_owned",
} as const;

export type PublicationErrorCode =
  (typeof PublicationErrorCode)[keyof typeof PublicationErrorCode];
