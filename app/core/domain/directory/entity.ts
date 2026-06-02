import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { DirectoryErrorCode } from "./errorCode";
import {
  DirectoryDepth,
  DirectoryId,
  DirectoryName,
  DirectorySlug,
  MAX_DIRECTORY_DEPTH,
} from "./valueObject";

type DirectoryBase = Readonly<{
  id: DirectoryId;
  ownerId: UserId;
  name: DirectoryName;
  slug: DirectorySlug;
  depth: DirectoryDepth;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

// Root directories have `parentId === null` and live at depth 0 with an
// empty `name` / `slug`. The discriminated union pushes "root vs non-root"
// to the type level so callers cannot accidentally rename / move / delete
// the root via the same code path as a regular directory.
export type RootDirectory = DirectoryBase &
  Readonly<{ parentId: null; depth: DirectoryDepth & 0 }>;

export type ChildDirectory = DirectoryBase &
  Readonly<{ parentId: DirectoryId }>;

export type Directory = RootDirectory | ChildDirectory;

function rename(
  dir: ChildDirectory,
  newName: DirectoryName,
  now: Date,
): ChildDirectory {
  if (DirectoryName.equals(dir.name, newName)) {
    return dir;
  }
  return {
    ...dir,
    name: newName,
    slug: DirectorySlug.fromName(newName),
    version: Version.next(dir.version),
    updatedAt: now,
  };
}

function moveTo(
  dir: ChildDirectory,
  newParent: Directory,
  now: Date,
): ChildDirectory {
  if (newParent.id === dir.id) {
    throw new BusinessRuleError(
      DirectoryErrorCode.CyclicMove,
      "A directory cannot be its own parent",
    );
  }
  if (newParent.id === dir.parentId) {
    return dir;
  }
  const nextDepth = DirectoryDepth.next(newParent.depth);
  return {
    ...dir,
    parentId: newParent.id,
    depth: nextDepth,
    version: Version.next(dir.version),
    updatedAt: now,
  };
}

// Depth recomputation used when a subtree is moved. Adapters / services
// walk descendants and call `recomputeDepth(child, newParentDepth)` to
// keep the invariant `depth = parent.depth + 1` after a parent change.
function recomputeDepth(
  dir: ChildDirectory,
  newParentDepth: DirectoryDepth,
  now: Date,
): ChildDirectory {
  const nextDepth = DirectoryDepth.next(newParentDepth);
  if ((nextDepth as number) === (dir.depth as number)) {
    return dir;
  }
  return {
    ...dir,
    depth: nextDepth,
    version: Version.next(dir.version),
    updatedAt: now,
  };
}

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  slug: string;
  depth: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export const Directory = {
  isRoot: (dir: Directory): dir is RootDirectory => dir.parentId === null,
  isChild: (dir: Directory): dir is ChildDirectory => dir.parentId !== null,

  /**
   * Create a non-root directory under `parent`. The factory enforces
   * the depth cap and derives `slug` from `name`. Sibling-name
   * uniqueness is an aggregate-spanning concern handled by
   * `DirectoryService.assertSiblingNameUnique` before this is called.
   */
  create: (
    params: {
      id: string;
      ownerId: UserId;
      parent: Directory;
      name: DirectoryName;
    },
    now: Date,
  ): ChildDirectory => {
    const depth = DirectoryDepth.next(params.parent.depth);
    return {
      id: DirectoryId.create(params.id),
      ownerId: params.ownerId,
      parentId: params.parent.id,
      name: params.name,
      slug: DirectorySlug.fromName(params.name),
      depth,
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * Create the per-owner root directory. The root is virtual: empty
   * `name` / `slug`, depth 0, no parent. `DirectoryService.ensureRoot`
   * is the only legitimate caller — production code must not create
   * additional roots for the same owner.
   */
  createRoot: (
    params: { id: string; ownerId: UserId },
    now: Date,
  ): RootDirectory => ({
    id: DirectoryId.create(params.id),
    ownerId: params.ownerId,
    parentId: null,
    name: DirectoryName.forRoot(),
    slug: DirectorySlug.forRoot(),
    depth: DirectoryDepth.root() as DirectoryDepth & 0,
    version: Version.initial(),
    createdAt: now,
    updatedAt: now,
  }),

  rename,
  moveTo,
  recomputeDepth,

  // Value objects throw `BusinessRuleError` from fresh-input paths; the
  // same failure during rehydration means stored data has drifted from
  // the schema, so wrap into `RehydrationError`. Adapters translate
  // that to `SystemError(DataIntegrityError)`.
  reconstruct: (input: ReconstructInput): Directory => {
    try {
      const id = DirectoryId.create(input.id);
      const ownerId = input.ownerId as UserId;
      const depth = DirectoryDepth.create(input.depth);
      const version = Version.create(input.version);
      const isRoot = input.parentId === null;

      if (isRoot) {
        if ((depth as number) !== 0) {
          throw new BusinessRuleError(
            DirectoryErrorCode.DepthMismatch,
            "Root directory must have depth 0",
          );
        }
        return {
          id,
          ownerId,
          parentId: null,
          name: DirectoryName.forRoot(),
          slug: DirectorySlug.forRoot(),
          depth: depth as DirectoryDepth & 0,
          version,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        } satisfies RootDirectory;
      }

      if ((depth as number) === 0) {
        throw new BusinessRuleError(
          DirectoryErrorCode.NonRootMustHaveParent,
          "Non-root directory cannot have depth 0",
        );
      }
      if (input.parentId === null) {
        throw new BusinessRuleError(
          DirectoryErrorCode.NonRootMustHaveParent,
          "Non-root directory must have a parent",
        );
      }
      return {
        id,
        ownerId,
        parentId: DirectoryId.create(input.parentId),
        name: DirectoryName.create(input.name),
        slug: DirectorySlug.create(input.slug),
        depth,
        version,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      } satisfies ChildDirectory;
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate Directory (id=${input.id})`,
        error,
      );
    }
  },
};

export { MAX_DIRECTORY_DEPTH };
