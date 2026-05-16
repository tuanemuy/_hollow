import { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";
import { type DirectoryTreeNode, toDirectoryTree } from "./view";

export type GetDirectoryTreeInput = {
  actorUserId: string;
};

export type GetDirectoryTreeOutput = {
  tree: readonly DirectoryTreeNode[];
};

export async function getDirectoryTree({
  container,
  input,
}: ServiceArgs<GetDirectoryTreeInput>): Promise<GetDirectoryTreeOutput> {
  const actorUserId = UserId.create(input.actorUserId);

  const directories = await container.unitOfWorkProvider.run(
    ({ directoryRepository }) => directoryRepository.findTree(actorUserId),
  );

  return { tree: toDirectoryTree(directories) };
}
