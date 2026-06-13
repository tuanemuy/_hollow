"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  field,
  fieldControl,
  fieldLabel,
  fieldTextarea,
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR } from "../layout/styles";
import { DirectoryPicker } from "../note/editor/DirectoryPicker";
import { parseTagInput } from "../note/editor/editorState";
import type { FlatDirectory } from "../note/loaders";
import {
  commitIngestionPreviewFn,
  discardIngestionPreviewFn,
  type IngestionJobWire,
  regenerateIngestionPreviewFn,
} from "./actions";

type Props = Readonly<{
  job: IngestionJobWire;
  tree: readonly FlatDirectory[];
  isTreeLoading: boolean;
  /**
   * Optional ref the parent uses to drive initial focus (see
   * `IngestionJobEditDialog`'s `initialFocusRef`). When omitted the form
   * carries no focus side-effect — the parent is responsible for landing
   * focus on the appropriate element.
   */
  titleInputRef?: React.RefObject<HTMLInputElement | null>;
  onCommitted: (noteId: string) => void;
  onDiscarded: () => void;
  /**
   * Notifies the parent that a regeneration was requested for `jobId`.
   * The job has transitioned `previewing → pending` and the LLM pipeline
   * is being re-driven asynchronously; the parent closes the editor and
   * lets the queue's polling / row progress track the fresh preview
   * (fire-and-forget model, see .issue/538/adr.md).
   */
  onRegenerated: (jobId: string) => void;
  onCancel: () => void;
}>;

const FRONT_MATTER_SUMMARY =
  "list-none inline-flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-ink-secondary [&::-webkit-details-marker]:hidden";

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
  titleInputRef,
  onCommitted,
  onDiscarded,
  onRegenerated,
  onCancel,
}: Props) {
  const router = useRouter();
  const commit = useServerFn(commitIngestionPreviewFn);
  const discard = useServerFn(discardIngestionPreviewFn);
  const regenerate = useServerFn(regenerateIngestionPreviewFn);

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

  // Each field carries an "AI suggestion" badge while its current value
  // matches the initial LLM-suggested value; it disappears the moment the
  // user types something different. We compare against the initial value
  // rather than tracking a separate `dirty` flag.
  const isTitleEdited = title !== initialTitle;
  const isTagsEdited = tagInput !== initialTagInput;
  const isFrontMatterEdited = frontMatterJson !== initialFrontMatter;
  const isDirectoryEdited =
    directoryId !== initialDirectoryId ||
    pendingDirectoryName !== initialPendingDirName;

  // The title input ref is owned by the parent (`IngestionJobEditDialog`)
  // so the form itself carries no focus side-effect. A local fallback ref
  // keeps the JSX self-contained when the prop is omitted.
  const localTitleInputRef = useRef<HTMLInputElement>(null);
  const effectiveTitleInputRef = titleInputRef ?? localTitleInputRef;

  const jobId = job.id;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    const trimmedJson = frontMatterJson.trim();
    const trimmedTitle = title.trim();
    const tagNames = parseTagInput(tagInput);
    startTransition(async () => {
      try {
        const result = await commit({
          data: {
            jobId,
            title: trimmedTitle,
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
        if (pendingDirectoryName !== null) {
          // 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate する。
          await router.invalidate();
        }
        onCommitted(result.noteId);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const runDiscard = () => {
    startTransition(async () => {
      try {
        await discard({ data: { jobId } });
        await routerInvalidate(router);
        onDiscarded();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onRegenerate = () => {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await regenerate({ data: { jobId } });
        // The job is back in `pending`; the `/upload` list behind the modal
        // also reflects that, so invalidate it (same as `runDiscard`).
        await routerInvalidate(router);
        onRegenerated(jobId);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  if (preview === null) {
    return <PreviewMissing />;
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6">
          <div className={field}>
            <label
              htmlFor={titleId}
              className={`${fieldLabel} inline-flex items-center gap-2`}
            >
              <span>タイトル</span>
              <AiSuggestionBadge edited={isTitleEdited} field="title" />
            </label>
            <input
              ref={effectiveTitleInputRef}
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
            allowNestedPath
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

          {error !== null && !confirmDiscardOpen ? (
            <p className={FORM_ERROR} role="alert">
              {displayError(error)}
            </p>
          ) : null}
        </div>

        <div
          data-action-bar=""
          className="flex-shrink-0 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t border-hairline bg-bg px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <button
            type="button"
            className={pillBtn}
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={`${pillBtn} ${pillBtnDanger}`}
            data-danger=""
            onClick={() => {
              setError(null);
              setConfirmDiscardOpen(true);
            }}
            disabled={isPending}
          >
            破棄
          </button>
          <button
            type="button"
            className={pillBtn}
            onClick={onRegenerate}
            disabled={isPending}
          >
            <Icon icon={RefreshCw} />
            再生成
          </button>
          <button
            type="submit"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            disabled={isPending}
            aria-busy={isPending || undefined}
          >
            {isPending ? (
              <>
                <Icon icon={Loader2} className="motion-safe:animate-spin" />
                登録中...
              </>
            ) : (
              "登録"
            )}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="ジョブを破棄"
        description="このジョブを破棄しますか？"
        confirmLabel="破棄"
        confirmIcon={Trash2}
        isPending={isPending}
        error={confirmDiscardOpen ? (error ?? undefined) : undefined}
        onConfirm={runDiscard}
        onClose={() => {
          setConfirmDiscardOpen(false);
          setError(null);
        }}
      />
    </>
  );
}

/**
 * Fallback rendered when the upstream job has no preview payload. Owns its
 * own focus side-effect: when mounted, focus is moved to the alert paragraph
 * itself so keyboard users do not lose their focus position. The parent's
 * initial-focus wiring targets `titleInputRef.current`, which is null in this
 * branch — keeping the focus handoff inside the form keeps the parent dialog
 * unaware of the fallback shape (W-A11Y-003 in review-001).
 */
function PreviewMissing() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} className={FORM_ERROR} role="alert" tabIndex={-1}>
      プレビューデータが見つかりません。
    </p>
  );
}
