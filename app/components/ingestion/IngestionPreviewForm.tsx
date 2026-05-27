"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  field,
  fieldControl,
  fieldLabel,
  fieldTextarea,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR, PILL_BTN } from "../layout/styles";
import { DirectoryPicker } from "../note/editor/DirectoryPicker";
import { parseTagInput } from "../note/editor/editorState";
import type { FlatDirectory } from "../note/loaders";
import {
  commitIngestionPreviewFn,
  discardIngestionPreviewFn,
  type IngestionJobWire,
} from "./actions";

type Props = Readonly<{
  job: IngestionJobWire;
  tree: readonly FlatDirectory[];
  isTreeLoading: boolean;
  onCommitted: (noteId: string) => void;
  onDiscarded: () => void;
  onCancel: () => void;
}>;

const READONLY_CONTENT =
  "note-detail-content max-h-[240px] overflow-y-auto rounded-md border border-hairline bg-surface-elevated p-4 text-sm text-ink";

function formatInitialFrontMatterJson(raw: string): string {
  if (raw.length === 0) return "";
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    ) {
      return "";
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function IngestionPreviewForm({
  job,
  tree,
  isTreeLoading,
  onCommitted,
  onDiscarded,
  onCancel,
}: Props) {
  const router = useRouter();
  const commit = useServerFn(commitIngestionPreviewFn);
  const discard = useServerFn(discardIngestionPreviewFn);

  const preview = job.preview;

  const titleId = useId();
  const tagsId = useId();
  const frontMatterId = useId();

  const initialFrontMatter = useMemo(
    () =>
      preview === null
        ? ""
        : formatInitialFrontMatterJson(preview.frontMatterJson),
    [preview],
  );
  const initialDirectoryId = useMemo(() => {
    if (preview === null) return null;
    return preview.suggestedDirectoryId;
  }, [preview]);
  const initialPendingDirName = useMemo(() => {
    if (preview === null) return null;
    if (preview.suggestedDirectoryId !== null) return null;
    return preview.suggestedDirectoryName;
  }, [preview]);

  const [title, setTitle] = useState<string>(preview?.title ?? "");
  const [directoryId, setDirectoryId] = useState<string | null>(
    initialDirectoryId,
  );
  const [pendingDirectoryName, setPendingDirectoryName] = useState<
    string | null
  >(initialPendingDirName);
  const [tagInput, setTagInput] = useState<string>(
    preview === null ? "" : preview.suggestedTagNames.join(", "),
  );
  const [frontMatterJson, setFrontMatterJson] =
    useState<string>(initialFrontMatter);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // W-F-003: Focus the title input when the editing view first mounts
  // so keyboard users land on the most-edited field. Done via ref +
  // effect (instead of `autoFocus`) to comply with biome's
  // a11y/noAutofocus rule.
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const jobId = job.id as unknown as string;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    const trimmedJson = frontMatterJson.trim();
    const tagNames = parseTagInput(tagInput);
    startTransition(async () => {
      try {
        const result = await commit({
          data: {
            jobId,
            title: title.trim(),
            ...(directoryId === null ? {} : { directoryId }),
            ...(pendingDirectoryName === null
              ? {}
              : { directoryNameToCreate: pendingDirectoryName }),
            tagNames: [...tagNames],
            ...(trimmedJson.length === 0
              ? {}
              : { frontMatterJson: trimmedJson }),
          },
        });
        onCommitted(result.noteId as unknown as string);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const runDiscard = () => {
    startTransition(async () => {
      try {
        await discard({ data: { jobId } });
        await router.invalidate();
        onDiscarded();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  if (preview === null) {
    return (
      <p className={FORM_ERROR} role="alert">
        プレビューデータが見つかりません。
      </p>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <div className={field}>
          <label htmlFor={titleId} className={fieldLabel}>
            タイトル
          </label>
          <input
            ref={titleInputRef}
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ノートのタイトル"
            maxLength={200}
            disabled={isPending}
            className={fieldControl}
          />
        </div>

        <DirectoryPicker
          tree={tree}
          directoryId={directoryId}
          pendingDirectoryName={pendingDirectoryName}
          onSelectExisting={(id) => {
            setDirectoryId(id);
            if (id !== null) setPendingDirectoryName(null);
          }}
          onSetPendingName={(name) => {
            setPendingDirectoryName(name);
            if (name !== null) setDirectoryId(null);
          }}
          disabled={isPending || isTreeLoading}
        />

        <div className={field}>
          <label htmlFor={tagsId} className={fieldLabel}>
            タグ（カンマ区切り）
          </label>
          <input
            id={tagsId}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="例: idea, draft"
            disabled={isPending}
            className={fieldControl}
          />
        </div>

        <div className={field}>
          <label htmlFor={frontMatterId} className={fieldLabel}>
            FrontMatter（JSON）
          </label>
          <textarea
            id={frontMatterId}
            value={frontMatterJson}
            onChange={(e) => setFrontMatterJson(e.target.value)}
            placeholder='{"key": "value"}'
            disabled={isPending}
            className={`${fieldControl} ${fieldTextarea} min-h-[140px]`}
            spellCheck={false}
          />
        </div>

        <div className={field}>
          <p className={fieldLabel}>本文プレビュー（読み取り専用）</p>
          <div
            className={READONLY_CONTENT}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: preview HTML is sanitised upstream by the ingestion pipeline
            dangerouslySetInnerHTML={{ __html: preview.contentHtml }}
          />
        </div>

        {error !== null ? (
          <p className={FORM_ERROR} role="alert">
            {displayError(error)}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex flex-wrap justify-end gap-2 border-t border-hairline bg-bg px-6 py-4">
          <button
            type="button"
            className={PILL_BTN}
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={PILL_BTN}
            data-danger=""
            onClick={() => setConfirmDiscardOpen(true)}
            disabled={isPending}
          >
            破棄
          </button>
          <button
            type="submit"
            className={PILL_BTN}
            data-primary=""
            disabled={isPending}
          >
            登録
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="ジョブを破棄"
        description="このジョブを破棄しますか？"
        confirmLabel="破棄"
        isPending={isPending}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          runDiscard();
        }}
        onClose={() => setConfirmDiscardOpen(false)}
      />
    </>
  );
}
