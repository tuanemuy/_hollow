import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@/core/domain/error";
import { User } from "@/core/domain/identity/entity";
import type { UserRepository } from "@/core/domain/identity/ports/userRepository";
import type {
  EmailAddress,
  UserId,
  Username,
} from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { users } from "../schema";
import { mapDbError } from "./helpers";

type UserRow = typeof users.$inferSelect;

/**
 * D1 implementation of `UserRepository` over the better-auth `users`
 * schema.
 *
 * Status derivation. The better-auth schema does not carry the domain's
 * `UserStatus` directly. The adapter derives it from the flags it does
 * carry, with the priority from `spec/database/index.md`:
 *
 *   1. `deleted_at != null`  → `deleted`
 *   2. `banned === 1`        → `suspended`
 *   3. `email_verified === 0` → `pending`
 *   4. otherwise              → `active`
 *
 * The reverse mapping (entity → row) lives in the write helpers below.
 *
 * OCC. The better-auth `users` table has no `version` column. The
 * adapter uses the row's `updated_at` instant as the OCC discriminator:
 * `findById` mints `ExpectedVersion<User>` from `updatedAt.getTime()`,
 * and `save` / `delete` match on the original ISO-formatted timestamp.
 * This file is the only legitimate construction site for the token
 * (via the `as` cast inside `toVersioned`). The domain entity carries
 * its own `version: Version` counter for diagnostic and event-payload
 * use, but it is not what the OCC predicate matches against.
 */
export class D1UserRepository implements UserRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private deriveStatus(row: UserRow): string {
    if (row.deletedAt !== null) return "deleted";
    if (row.banned === 1) return "suspended";
    if (row.emailVerified === 0) return "pending";
    return "active";
  }

  private toUser(row: UserRow): User {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored user has malformed id: ${row.id}`,
      );
    }
    try {
      return User.reconstruct({
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.name,
        bio: row.bio,
        avatarMediaId: row.avatarMediaId,
        status: this.deriveStatus(row),
        role: row.role,
        version: 0,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        lastUsernameChangedAt:
          row.lastUsernameChangedAt === null
            ? null
            : new Date(row.lastUsernameChangedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored user violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: UserRow): Versioned<User> {
    return {
      entity: this.toUser(row),
      // The OCC token is the row's `updated_at` in milliseconds. The
      // brand keeps it nominally a `number` so the type system still
      // enforces "thread the token through `findById`"; the adapter
      // decodes it back to an ISO string in the matching `save` /
      // `delete` predicates.
      expectedVersion: new Date(
        row.updatedAt,
      ).getTime() as ExpectedVersion<User>,
    };
  }

  // Maps the domain User state back into the better-auth flag columns.
  // Status is encoded structurally so the priority laid out in
  // `deriveStatus` stays round-trippable.
  private statusFlags(user: User): {
    emailVerified: 0 | 1;
    banned: 0 | 1;
    deletedAt: string | null;
  } {
    switch (user.status) {
      case "deleted":
        return {
          emailVerified: 1,
          banned: 0,
          deletedAt: user.updatedAt.toISOString(),
        };
      case "suspended":
        return { emailVerified: 1, banned: 1, deletedAt: null };
      case "active":
        return { emailVerified: 1, banned: 0, deletedAt: null };
      case "pending":
        return { emailVerified: 0, banned: 0, deletedAt: null };
    }
  }

  findById(id: string): Promise<Versioned<User> | null> {
    return mapDbError("Failed to find user", async () => {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  findByUsername(username: Username): Promise<User | null> {
    return mapDbError("Failed to find user by username", async () => {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      const row = rows[0];
      return row ? this.toUser(row) : null;
    });
  }

  findByEmail(email: EmailAddress): Promise<User | null> {
    return mapDbError("Failed to find user by email", async () => {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const row = rows[0];
      return row ? this.toUser(row) : null;
    });
  }

  countAdmins(): Promise<number> {
    return mapDbError("Failed to count admins", async () => {
      // "Admins with status !== 'deleted'": deleted_at IS NULL filters
      // out the only state that hard-fails the admin-protection check.
      // Suspended admins (banned = 1) still count per the domain spec
      // note on `assertNotLastAdmin`.
      const rows = await this.db
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
      return Number(rows[0]?.value ?? 0);
    });
  }

  listAll(opts: { limit: number; cursor?: UserId }): Promise<readonly User[]> {
    return mapDbError("Failed to list users", async () => {
      const rows = opts.cursor
        ? await this.db
            .select()
            .from(users)
            .where(gt(users.id, opts.cursor))
            .orderBy(asc(users.id))
            .limit(opts.limit)
        : await this.db
            .select()
            .from(users)
            .orderBy(asc(users.id))
            .limit(opts.limit);
      return rows.map((row) => this.toUser(row));
    });
  }

  async insert(user: User): Promise<void> {
    const flags = this.statusFlags(user);
    this.pending.add(
      this.db.insert(users).values({
        id: user.id,
        name: user.displayName,
        email: user.email,
        emailVerified: flags.emailVerified,
        image: null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        username: user.username,
        displayUsername: null,
        role: user.role,
        banned: flags.banned,
        banReason: null,
        banExpires: null,
        bio: user.bio,
        avatarMediaId: user.avatarMediaId,
        lastUsernameChangedAt:
          user.lastUsernameChangedAt === null
            ? null
            : user.lastUsernameChangedAt.toISOString(),
        deletedAt: flags.deletedAt,
      }),
    );
  }

  async save(
    user: User,
    expectedVersion: ExpectedVersion<User>,
  ): Promise<void> {
    const userId = user.id;
    const flags = this.statusFlags(user);
    // The OCC token encodes the previously-observed `updated_at` in ms.
    // Decode it back to the ISO-string form actually stored on the row.
    const expectedUpdatedAt = new Date(
      expectedVersion as unknown as number,
    ).toISOString();
    this.pending.addOcc(
      this.db
        .update(users)
        .set({
          name: user.displayName,
          email: user.email,
          emailVerified: flags.emailVerified,
          updatedAt: user.updatedAt.toISOString(),
          username: user.username,
          role: user.role,
          banned: flags.banned,
          banReason: null,
          banExpires: null,
          bio: user.bio,
          avatarMediaId: user.avatarMediaId,
          lastUsernameChangedAt:
            user.lastUsernameChangedAt === null
              ? null
              : user.lastUsernameChangedAt.toISOString(),
          deletedAt: flags.deletedAt,
        })
        .where(
          and(eq(users.id, user.id), eq(users.updatedAt, expectedUpdatedAt)),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving user ${userId}: expected updatedAt ${expectedUpdatedAt}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<User>,
  ): Promise<void> {
    const expectedUpdatedAt = new Date(
      expectedVersion as unknown as number,
    ).toISOString();
    this.pending.addOcc(
      this.db
        .delete(users)
        .where(and(eq(users.id, id), eq(users.updatedAt, expectedUpdatedAt))),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting user ${id}: expected updatedAt ${expectedUpdatedAt}`,
        );
      },
    );
  }
}
