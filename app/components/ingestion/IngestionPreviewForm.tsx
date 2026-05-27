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
  "note-detail-content rounded-md border border-hairline bg-surface-elevated p-4 text-sm text-ink";

const FRONT_MATTER_SUMMARY =
  "list-none inline-flex items-center gap-2 cursor-pointer select-none text-[13px] font-medium text-ink-secondary [&::-webkit-details-marker]:hidden";

const AI_BADGE = "text-[11px] font-normal text-ink-tertiary";

/**
 * Inline "AI suggestion" caption rendered next to each form label while
 * the user has not yet edited that field. Disappears the moment the
 * current value diverges from the initial LLM suggestion (see ADR-003).
 *
 * `field` is reflected to `data-ai-badge-for` so per-field assertions
 * can locate the badge without relying on global span counts.
 */
function AiSuggestionBadge({
  edited,
  field,
}: {
  edited: boolean;
  field: "title" | "directory" | "tags" | "frontmatter";
}) {
  if (edited) return null;
  return (
    <span className={AI_BADGE} data-ai-badge-for={field}>
      ✨ AI 提案
    </span>
  );
}

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

  const initialTitle = preview?.title ?? "";
  const initialTagInput = useMemo(
    () => (preview === null ? "" : preview.suggestedTagNames.join(", ")),
    [preview],
  );
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

  const [title, setTitle] = useState<string>(initialTitle);
  const [directoryId, setDirectoryId] = useState<string | null>(
    initialDirectoryId,
  );
  const [pendingDirectoryName, setPendingDirectoryName] = useState<
    string | null
  >(initialPendingDirName);
  const [tagInput, setTagInput] = useState<string>(initialTagInput);
  const [frontMatterJson, setFrontMatterJson] =
    useState<string>(initialFrontMatter);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // H-2 (Issue #259): each field carries an "AI suggestion" badge while
  // its current value matches the initial LLM-suggested value. The
  // moment the user types something different, the badge disappears.
  // See ADR-003 for why we compare against the initial value instead of
  // tracking a separate `dirty` flag.
  const isTitleEdited = title !== initialTitle;
  const isTagsEdited = tagInput !== initialTagInput;
  const isFrontMatterEdited = frontMatterJson !== initialFrontMatter;
  const isDirectoryEdited =
    directoryId !== initialDirectoryId ||
    pendingDirectoryName !== initialPendingDirName;

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
      <form onSubmit={onSubmit} className="flex flex-1 flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className={field}>
            <label
              htmlFor={titleId}
              className={`${fieldLabel} inline-flex items-center gap-2`}
            >
              <span>タイトル</span>
              <AiSuggestionBadge edited={isTitleEdited} field="title" />
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

          <div className={field}>
            <p className={fieldLabel}>
              本文プレビュー（LLM 抽出・読み取り専用）
            </p>
            <div
              className={READONLY_CONTENT}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: preview HTML is sanitised upstream by the ingestion pipeline
              dangerouslySetInnerHTML={{ __html: preview.contentHtml }}
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
            legendSlot={
              <AiSuggestionBadge edited={isDirectoryEdited} field="directory" />
            }
          />

          <div className={field}>
            <label
              htmlFor={tagsId}
              className={`${fieldLabel} inline-flex items-center gap-2`}
            >
              <span>タグ（カンマ区切り）</span>
              <AiSuggestionBadge edited={isTagsEdited} field="tags" />
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

          <details className={`${field} group`}>
            <summary className={FRONT_MATTER_SUMMARY}>
              <span
                aria-hidden="true"
                className="inline-block transition-transform motion-reduce:transition-none group-open:rotate-90"
              >
                ▸
              </span>
              <span>FrontMatter（JSON）</span>
              <AiSuggestionBadge
                edited={isFrontMatterEdited}
                field="frontmatter"
              />
            </summary>
            <div className="mt-2">
              <label htmlFor={frontMatterId} className="sr-only">
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
          </details>

          {error !== null ? (
            <p className={FORM_ERROR} role="alert">
              {displayError(error)}
            </p>
          ) : null}
        </div>

        <div className="flex-shrink-0 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t border-hairline bg-bg px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
