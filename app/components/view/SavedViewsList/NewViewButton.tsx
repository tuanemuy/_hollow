"use client";

import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import type { FlatDirectory } from "@/components/note/directoryTree";
import { createSavedViewFn } from "@/components/view/actions";
import { ViewFormDialog } from "@/components/view/ViewFormDialog";

type Props = {
  directories: readonly FlatDirectory[];
  tags: ReadonlyArray<{ id: string; name: string }>;
};

export function NewViewButton({ directories, tags }: Props) {
  const create = useServerFn(createSavedViewFn);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-primary
        className={`${pillBtn} ${pillBtnPrimary}`}
        onClick={() => setOpen(true)}
      >
        <Icon icon={Plus} />
        新しいビュー
      </button>
      <ViewFormDialog
        mode="create"
        open={open}
        onClose={() => setOpen(false)}
        directories={directories}
        tags={tags}
        submit={create}
      />
    </>
  );
}
