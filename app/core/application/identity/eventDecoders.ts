import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { IdentityEvent } from "@/core/domain/identity/events";
import { UserId } from "@/core/domain/identity/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const userCreatedSchema = z.object({ userId: z.string() }).strict();
const userDeletedSchema = z
  .object({
    userId: z.string(),
    deletedAt: z.coerce.date(),
  })
  .strict();
const userSuspendedSchema = z.object({ userId: z.string() }).strict();
const userReinstatedSchema = z.object({ userId: z.string() }).strict();

export type IdentityEventDecoders = {
  readonly [K in IdentityEvent["type"]]: EventDecoder<
    Extract<IdentityEvent, { type: K }>
  >;
};

export const identityEventDecoders: IdentityEventDecoders = {
  "user.created": buildEventDecoder("user.created", userCreatedSchema, (p) => ({
    userId: UserId.create(p.userId),
  })),
  "user.deleted": buildEventDecoder("user.deleted", userDeletedSchema, (p) => ({
    userId: UserId.create(p.userId),
    deletedAt: p.deletedAt,
  })),
  "user.suspended": buildEventDecoder(
    "user.suspended",
    userSuspendedSchema,
    (p) => ({ userId: UserId.create(p.userId) }),
  ),
  "user.reinstated": buildEventDecoder(
    "user.reinstated",
    userReinstatedSchema,
    (p) => ({ userId: UserId.create(p.userId) }),
  ),
};
