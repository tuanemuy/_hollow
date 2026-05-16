import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { ContentHtml } from "@/core/domain/note/valueObject";
import { Tag } from "../entity";
import { TagErrorCode } from "../errorCode";
import type { TagBlacklistRepository } from "../ports/tagBlacklistRepository";
import type { TagRepository } from "../ports/tagRepository";
import { TagService } from "../service";
import { type TagBlacklistEntry, type TagId, TagName } from "../valueObject";

const T0 = new Date(0);
const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

const OWNER_A = "01950000-0000-7000-8000-00000000000a" as UserId;
const OWNER_B = "01950000-0000-7000-8000-00000000000b" as UserId;

const makeTag = (n: number, owner: UserId, raw: string) =>
  Tag.create({ id: rawId(n), ownerId: owner, name: TagName.create(raw) }, T0);

/**
 * In-memory `TagRepository` that implements only the read methods used by
 * `TagService` (plus `insert` for `resolveOrCreate`). Mutating port methods
 * we do not exercise simply throw — the tests assert this is never reached.
 */
class FakeTagRepo implements TagRepository {
  readonly inserted: Tag[] = [];
  constructor(private readonly initial: readonly Tag[]) {}

  async findByOwnerAndName(ownerId: UserId, name: TagName) {
    const all = [...this.initial, ...this.inserted];
    return (
      all.find((t) => t.ownerId === ownerId && TagName.equals(t.name, name)) ??
      null
    );
  }
  async findByOwner() {
    return [];
  }
  async findByIds() {
    return [];
  }
  async findById() {
    return null;
  }
  async insert(tag: Tag) {
    this.inserted.push(tag);
  }
  async save() {
    throw new Error("FakeTagRepo.save: not used in service tests");
  }
  async delete() {
    throw new Error("FakeTagRepo.delete: not used in service tests");
  }
}

class FakeBlacklistRepo implements TagBlacklistRepository {
  constructor(private readonly blocked: ReadonlySet<string>) {}

  async isBlacklisted(_owner: UserId, name: TagName) {
    return this.blocked.has(name as unknown as string);
  }
  async add() {
    throw new Error("not used");
  }
  async remove() {
    throw new Error("not used");
  }
  async listByOwner(): Promise<readonly TagBlacklistEntry[]> {
    return [];
  }
}

describe("TagService.computeMergePlan", () => {
  it("returns a plan with source/target ids when owners match and tags differ", () => {
    const source = makeTag(1, OWNER_A, "src");
    const target = makeTag(2, OWNER_A, "tgt");
    const plan = TagService.computeMergePlan(source, target);
    expect(plan.fromTagId).toBe(source.id);
    expect(plan.toTagId).toBe(target.id);
  });

  it("throws MergeOwnerMismatch when owners differ", () => {
    const source = makeTag(1, OWNER_A, "src");
    const target = makeTag(2, OWNER_B, "tgt");
    try {
      TagService.computeMergePlan(source, target);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.MergeOwnerMismatch);
      }
    }
  });

  it("throws MergeSameTag when source and target are the same tag", () => {
    const tag = makeTag(1, OWNER_A, "x");
    try {
      TagService.computeMergePlan(tag, tag);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.MergeSameTag);
      }
    }
  });
});

describe("TagService.renameInBody", () => {
  const html = (s: string) => s as unknown as ContentHtml;

  it("replaces `#oldName` followed by whitespace, end of string, or HTML metachar", () => {
    const before = html("a #foo b #foo<span> c #foo");
    const after = TagService.renameInBody(
      before,
      TagName.create("foo"),
      TagName.create("bar"),
    );
    expect(after as unknown as string).toBe("a #bar b #bar<span> c #bar");
  });

  it("does not replace `#foo` when followed by another tag-body char (e.g. `#foobar`)", () => {
    const before = html("#foobar #foo");
    const after = TagService.renameInBody(
      before,
      TagName.create("foo"),
      TagName.create("bar"),
    );
    expect(after as unknown as string).toBe("#foobar #bar");
  });

  it("is a no-op when oldName equals newName", () => {
    const before = html("#foo #foo");
    const after = TagService.renameInBody(
      before,
      TagName.create("foo"),
      TagName.create("foo"),
    );
    expect(after).toBe(before);
  });

  it("escapes regex-meta characters in oldName so they match literally", () => {
    // A name that survives `TagName.create` and would otherwise have regex
    // meaning if not escaped: e.g. `a.b`.
    const before = html("#a.b end");
    const after = TagService.renameInBody(
      before,
      TagName.create("a.b"),
      TagName.create("z"),
    );
    expect(after as unknown as string).toBe("#z end");
  });
});

describe("TagService.extractFromHtml", () => {
  const html = (s: string) => s as unknown as ContentHtml;

  it("collects hashtag tokens from a string", () => {
    const out = TagService.extractFromHtml(
      html("hello #alpha world #beta end"),
    );
    expect(out.map((n) => n as unknown as string)).toEqual(["alpha", "beta"]);
  });

  it("de-duplicates by canonical name", () => {
    const out = TagService.extractFromHtml(html("#foo #foo #foo"));
    expect(out.map((n) => n as unknown as string)).toEqual(["foo"]);
  });

  it("stops a token at HTML metacharacters", () => {
    const out = TagService.extractFromHtml(html("<span>#foo</span>"));
    expect(out.map((n) => n as unknown as string)).toEqual(["foo"]);
  });

  it("silently drops tokens that would fail TagName.create (over-length)", () => {
    const longRaw = "a".repeat(60);
    const out = TagService.extractFromHtml(html(`#ok #${longRaw} end`));
    expect(out.map((n) => n as unknown as string)).toEqual(["ok"]);
  });

  it("returns an empty list when no tokens are present", () => {
    const out = TagService.extractFromHtml(html("no tags here"));
    expect(out).toEqual([]);
  });
});

describe("TagService.assertNameUnique", () => {
  it("returns without error when no tag has the name", async () => {
    const repo = new FakeTagRepo([]);
    await expect(
      TagService.assertNameUnique(OWNER_A, TagName.create("fresh"), null, repo),
    ).resolves.toBeUndefined();
  });

  it("returns without error when the same name belongs to `exceptId`", async () => {
    const existing = makeTag(1, OWNER_A, "same");
    const repo = new FakeTagRepo([existing]);
    await expect(
      TagService.assertNameUnique(
        OWNER_A,
        TagName.create("same"),
        existing.id as TagId,
        repo,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws NameNotUnique when another tag holds the name", async () => {
    const existing = makeTag(1, OWNER_A, "taken");
    const repo = new FakeTagRepo([existing]);
    try {
      await TagService.assertNameUnique(
        OWNER_A,
        TagName.create("taken"),
        null,
        repo,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameNotUnique);
      }
    }
  });

  it("scopes uniqueness by owner (same name under a different owner is ignored)", async () => {
    const otherOwnerTag = makeTag(1, OWNER_B, "shared");
    const repo = new FakeTagRepo([otherOwnerTag]);
    await expect(
      TagService.assertNameUnique(
        OWNER_A,
        TagName.create("shared"),
        null,
        repo,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("TagService.resolveOrCreate", () => {
  it("creates new tags for missing names and reuses existing ones", async () => {
    const existing = makeTag(1, OWNER_A, "alpha");
    const repo = new FakeTagRepo([existing]);
    const blacklist = new FakeBlacklistRepo(new Set());
    let counter = 100;
    const mint = () => rawId(counter++);

    const ids = await TagService.resolveOrCreate(
      OWNER_A,
      [TagName.create("alpha"), TagName.create("beta")],
      mint,
      T0,
      repo,
      blacklist,
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(existing.id);
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.name as unknown as string).toBe("beta");
  });

  it("skips blacklisted names", async () => {
    const repo = new FakeTagRepo([]);
    const blacklist = new FakeBlacklistRepo(new Set(["blocked"]));
    const ids = await TagService.resolveOrCreate(
      OWNER_A,
      [TagName.create("ok"), TagName.create("blocked")],
      () => rawId(200),
      T0,
      repo,
      blacklist,
    );
    expect(ids).toHaveLength(1);
    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]?.name as unknown as string).toBe("ok");
  });

  it("de-duplicates the input list (one id per canonical name)", async () => {
    const repo = new FakeTagRepo([]);
    const blacklist = new FakeBlacklistRepo(new Set());
    let counter = 300;
    const mint = () => rawId(counter++);
    const ids = await TagService.resolveOrCreate(
      OWNER_A,
      [TagName.create("foo"), TagName.create("#foo"), TagName.create("foo")],
      mint,
      T0,
      repo,
      blacklist,
    );
    expect(ids).toHaveLength(1);
    expect(repo.inserted).toHaveLength(1);
  });
});
