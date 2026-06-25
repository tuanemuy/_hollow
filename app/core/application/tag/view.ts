import type { Tag } from "@/core/domain/tag/entity";
import { type TagDTO, toTagDTO } from "../dto/tag";
import { type TagMergeJobDTO, toTagMergeJobDTO } from "../dto/tagMergeJob";

export type TagView = TagDTO;

export const toTagView = toTagDTO;

export type { Tag, TagMergeJobDTO };

export const toTagMergeJobView = toTagMergeJobDTO;
