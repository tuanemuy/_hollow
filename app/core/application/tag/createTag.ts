import type { UserId as DomainUserId } from "@/core/domain/identity/valueObject";
import { Tag } from "@/core/domain/tag/entity";
import { TagService } from "@/core/domain/tag/service";
import { TagName } from "@/core/domain/tag/valueObject";
import type { ServiceArgs } from "../types";
import { type TagView, toTagView } from "./view";

export type CreateTagInput = {
  actorUserId: string;
  name: string;
};

export type CreateTagOutput = {
  tag: TagView;
};

export async function createTag({
  container,
  input,
}: ServiceArgs<CreateTagInput>): Promise<CreateTagOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const ownerId = input.actorUserId as DomainUserId;
  const name = TagName.create(input.name);

  const tag = await container.unitOfWorkProvider.run(
    async ({ tagRepository, tagBlacklistRepository }) => {
      await TagService.assertNameUnique(ownerId, name, null, tagRepository);
      const created = Tag.create({ id, ownerId, name }, now);
      await tagRepository.insert(created);
      // Re-adding a previously deleted tag name lifts the blacklist
      // entry so future automatic re-extraction is no longer suppressed.
      await tagBlacklistRepository.remove(ownerId, name);
      return created;
    },
  );

  // A freshly created tag has no notes; the returned `noteCount` is not
  // read by the frontend (display counts come from `listTags`).
  return { tag: toTagView(tag, 0) };
}
