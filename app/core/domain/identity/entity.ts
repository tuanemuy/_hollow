import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import { IdentityErrorCode } from "./errorCode";
import { type IdentityEvent, IdentityEvents } from "./events";
import {
  Bio,
  DisplayName,
  EmailAddress,
  type MediaAssetId,
  MediaAssetId as MediaAssetIdVO,
  Role,
  type UserId,
  UserId as UserIdVO,
  Username,
  UserStatus,
} from "./valueObject";

/**
 * Cooldown between username changes (30 days). SSOT for the rate limit
 * enforced in `changeUsername`; the frontend imports it to derive the
 * "次に変更できる日付" hint so the displayed date cannot drift from the
 * domain rule.
 */
export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type UserBase = Readonly<{
  id: UserId;
  username: Username;
  email: EmailAddress;
  displayName: string;
  bio: string | null;
  avatarMediaId: MediaAssetId | null;
  role: Role;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
  lastUsernameChangedAt: Date | null;
}>;

export type PendingUser = UserBase & Readonly<{ status: "pending" }>;
export type ActiveUser = UserBase & Readonly<{ status: "active" }>;
export type SuspendedUser = UserBase & Readonly<{ status: "suspended" }>;
// Deleted users are frozen — no further mutation is permitted. Type-level
// state lets behaviour methods narrow non-deleted variants at compile time
// and throw at runtime if a deleted instance is reached through `User`.
export type DeletedUser = UserBase & Readonly<{ status: "deleted" }>;

export type User = PendingUser | ActiveUser | SuspendedUser | DeletedUser;
export type LiveUser = PendingUser | ActiveUser | SuspendedUser;

type CreateInput = Readonly<{
  id: string;
  username: Username;
  email: EmailAddress;
  displayName: string | null;
  role: Role;
}>;

function create(
  input: CreateInput,
  now: Date,
): WithEventDrafts<PendingUser, IdentityEvent> {
  const id = UserIdVO.create(input.id);
  const displayName = DisplayName.create(input.displayName ?? input.username);
  const user: PendingUser = {
    status: "pending",
    id,
    username: input.username,
    email: input.email,
    displayName,
    bio: null,
    avatarMediaId: null,
    role: input.role,
    version: Version.initial(),
    createdAt: now,
    updatedAt: now,
    lastUsernameChangedAt: null,
  };
  return {
    entity: user,
    eventDrafts: [IdentityEvents.created(user.id, now)],
  };
}

function activate(user: User, now: Date): ActiveUser {
  if (user.status !== "pending") {
    throw new BusinessRuleError(
      IdentityErrorCode.UserNotPending,
      `User cannot be activated from status: ${user.status}`,
    );
  }
  return {
    ...user,
    status: "active",
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function suspend(
  user: User,
  now: Date,
): WithEventDrafts<SuspendedUser, IdentityEvent> {
  if (user.status !== "active") {
    throw new BusinessRuleError(
      IdentityErrorCode.UserNotActive,
      `User cannot be suspended from status: ${user.status}`,
    );
  }
  const next: SuspendedUser = {
    ...user,
    status: "suspended",
    version: Version.next(user.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IdentityEvents.suspended(next.id, now)],
  };
}

function reinstate(
  user: User,
  now: Date,
): WithEventDrafts<ActiveUser, IdentityEvent> {
  if (user.status !== "suspended") {
    throw new BusinessRuleError(
      IdentityErrorCode.UserNotSuspended,
      `User cannot be reinstated from status: ${user.status}`,
    );
  }
  const next: ActiveUser = {
    ...user,
    status: "active",
    version: Version.next(user.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IdentityEvents.reinstated(next.id, now)],
  };
}

function markDeleted(
  user: User,
  now: Date,
): WithEventDrafts<DeletedUser, IdentityEvent> {
  if (user.status === "deleted") {
    throw new BusinessRuleError(
      IdentityErrorCode.AlreadyDeleted,
      "User is already deleted",
    );
  }
  const next: DeletedUser = {
    ...user,
    status: "deleted",
    version: Version.next(user.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IdentityEvents.deleted(next.id, now, now)],
  };
}

function assertMutable(user: User): asserts user is LiveUser {
  if (user.status === "deleted") {
    throw new BusinessRuleError(
      IdentityErrorCode.AlreadyDeleted,
      "Cannot mutate a deleted user",
    );
  }
}

function changeUsername(
  user: User,
  newUsername: Username,
  now: Date,
): LiveUser {
  assertMutable(user);
  // No-op before the cooldown check: resubmitting the current username
  // changes nothing, so the 30-day rate limit (which guards *actual*
  // renames) must not reject it.
  if (Username.equals(user.username, newUsername)) {
    return user;
  }
  if (
    user.lastUsernameChangedAt !== null &&
    now.getTime() - user.lastUsernameChangedAt.getTime() <
      USERNAME_CHANGE_COOLDOWN_MS
  ) {
    throw new BusinessRuleError(
      IdentityErrorCode.UsernameChangeTooSoon,
      "Username can only be changed once every 30 days",
    );
  }
  return {
    ...user,
    username: newUsername,
    version: Version.next(user.version),
    updatedAt: now,
    lastUsernameChangedAt: now,
  };
}

function changeEmail(user: User, newEmail: EmailAddress, now: Date): LiveUser {
  assertMutable(user);
  if (EmailAddress.equals(user.email, newEmail)) {
    return user;
  }
  return {
    ...user,
    email: newEmail,
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function changeDisplayName(user: User, name: string, now: Date): LiveUser {
  assertMutable(user);
  const next = DisplayName.create(name);
  if (next === user.displayName) {
    return user;
  }
  return {
    ...user,
    displayName: next,
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function changeBio(user: User, bio: string | null, now: Date): LiveUser {
  assertMutable(user);
  const next = Bio.create(bio);
  if (next === user.bio) {
    return user;
  }
  return {
    ...user,
    bio: next,
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function changeAvatar(
  user: User,
  mediaId: MediaAssetId | null,
  now: Date,
): LiveUser {
  assertMutable(user);
  if (mediaId === user.avatarMediaId) {
    return user;
  }
  return {
    ...user,
    avatarMediaId: mediaId,
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function promoteToAdmin(user: User, now: Date): LiveUser {
  assertMutable(user);
  if (user.role === "admin") {
    throw new BusinessRuleError(
      IdentityErrorCode.AlreadyAdmin,
      "User is already an admin",
    );
  }
  return {
    ...user,
    role: "admin",
    version: Version.next(user.version),
    updatedAt: now,
  };
}

function demoteToMember(user: User, now: Date): LiveUser {
  assertMutable(user);
  if (user.role === "member") {
    throw new BusinessRuleError(
      IdentityErrorCode.AlreadyMember,
      "User is already a member",
    );
  }
  return {
    ...user,
    role: "member",
    version: Version.next(user.version),
    updatedAt: now,
  };
}

// Loose-typed because adapters feed untrusted persistence rows; each field
// is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarMediaId: string | null;
  status: string;
  role: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsernameChangedAt: Date | null;
}>;

export const User = {
  isPending: (user: User): user is PendingUser => user.status === "pending",
  isActive: (user: User): user is ActiveUser => user.status === "active",
  isSuspended: (user: User): user is SuspendedUser =>
    user.status === "suspended",
  isDeleted: (user: User): user is DeletedUser => user.status === "deleted",
  isLive: (user: User): user is LiveUser => user.status !== "deleted",

  create,

  // Adapter rehydration wraps any VO failure into `RehydrationError` so
  // the boundary between "fresh input is invalid" (BusinessRuleError) and
  // "stored data has drifted from schema" (data-integrity bug) stays
  // clean. Adapters translate `RehydrationError` into
  // `SystemError(DataIntegrityError)`.
  reconstruct: (input: ReconstructInput): User => {
    try {
      const status = UserStatus.create(input.status);
      const base: UserBase = {
        id: UserIdVO.create(input.id),
        username: Username.create(input.username),
        email: EmailAddress.create(input.email),
        displayName: DisplayName.create(input.displayName),
        bio: Bio.create(input.bio),
        avatarMediaId:
          input.avatarMediaId === null
            ? null
            : MediaAssetIdVO.create(input.avatarMediaId),
        role: Role.create(input.role),
        version: Version.create(input.version),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        lastUsernameChangedAt: input.lastUsernameChangedAt,
      };
      switch (status) {
        case "pending":
          return { ...base, status } satisfies PendingUser;
        case "active":
          return { ...base, status } satisfies ActiveUser;
        case "suspended":
          return { ...base, status } satisfies SuspendedUser;
        case "deleted":
          return { ...base, status } satisfies DeletedUser;
      }
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate User (id=${input.id})`,
        error,
      );
    }
  },

  activate,
  suspend,
  reinstate,
  markDeleted,
  changeUsername,
  changeEmail,
  changeDisplayName,
  changeBio,
  changeAvatar,
  promoteToAdmin,
  demoteToMember,
};
