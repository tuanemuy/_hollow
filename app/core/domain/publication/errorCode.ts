export const PublicationErrorCode = {
  InvalidShareLinkId: "PUBLICATION_INVALID_SHARE_LINK_ID",
  InvalidVisibility: "PUBLICATION_INVALID_VISIBILITY",
  InvalidShareLinkStatus: "PUBLICATION_INVALID_SHARE_LINK_STATUS",
  InvalidTokenHash: "PUBLICATION_INVALID_TOKEN_HASH",
  ShareLinkPasswordTooShort: "PUBLICATION_SHARE_LINK_PASSWORD_TOO_SHORT",
  ShareLinkPasswordTooLong: "PUBLICATION_SHARE_LINK_PASSWORD_TOO_LONG",
  InvalidFailedAttempts: "PUBLICATION_INVALID_FAILED_ATTEMPTS",
  InvariantPrivatePublishedAt: "PUBLICATION_INVARIANT_PRIVATE_PUBLISHED_AT",
  ShareLinkRevoked: "PUBLICATION_SHARE_LINK_REVOKED",
  ShareLinkQuotaExceeded: "PUBLICATION_SHARE_LINK_QUOTA_EXCEEDED",
  MediaNotOwned: "PUBLICATION_MEDIA_NOT_OWNED",
} as const;

export type PublicationErrorCode =
  (typeof PublicationErrorCode)[keyof typeof PublicationErrorCode];
