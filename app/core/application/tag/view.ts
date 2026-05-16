import type { Tag } from "@/core/domain/tag/entity";
import { type TagDTO, toTagDTO } from "../dto/tag";

export type TagView = TagDTO;

export const toTagView = toTagDTO;

export type { Tag };
