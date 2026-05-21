export const CommonErrorCode = {
  InvalidVersion: "invalid_version",
  InvalidEventId: "invalid_event_id",
} as const;

export type CommonErrorCode =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
