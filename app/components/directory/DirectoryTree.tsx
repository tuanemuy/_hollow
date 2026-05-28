"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { renameDirectoryFn } from "./actions";
import { DIRECTORY_NAME_MAX_LENGTH } from "./schema";
import { CreateDirectoryDialog } from "./CreateDirectoryDialog";
import { DeleteDirectoryDialog } from "./DeleteDirectoryDialog";
import { DirectoryActionsMenu } from "./DirectoryActionsMenu";
import { MoveDirectoryDialog } from "./MoveDirectoryDialog";
import {
  TREE_DISCLOSURE,
  TREE_ITEM_ERROR,
  TREE_ITEM_LINK,
  TREE_ITEM_RENAME_INPUT,
  TREE_ITEM_ROW,
} from "./styles";

export type DirectoryTreeProps = Readonly<{
  /**
   * Forest from `loadDirectoryTree`. `tree[0]` is the implicit root
   * (ensured by `DirectoryService.ensureRoot` at signup). Rendering
   * starts at `tree[0].children` — the root itself (name="", depth=0)
   * is intentionally not drawn.
   */
  tree: readonly DirectoryTreeNode[];
}>;

type DialogState =
  | { kind: "none" }
  | { kind: "createChild"; parentId: string; parentName: string }
  | { kind: "move"; directoryId: string; directoryName: string }
  | { kind: "delete"; directoryId: string; directoryName: string };

const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

export function DirectoryTree({ tree }: DirectoryTreeProps) {
  // tree[0] is the implicit root (ensured by DirectoryService.ensureRoot).
  const root = tree[0];
  const children = root?.children ?? [];

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<{
    id: string;
    error: SerializedError;
  } | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const treeRef = useRef<HTMLDivElement | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  }, []);

  const isExpanded = useCallback(
    (id: string): boolean => expanded[id] !== false,
    [expanded],
  );

  // Move focus to next/previous visible treeitem via arrow keys.
  const focusSibling = useCallback(
    (event: KeyboardEvent<HTMLElement>, direction: "next" | "prev") => {
      const tree = treeRef.current;
      if (tree === null) return;
      const items = Array.from(
        tree.querySelectorAll<HTMLElement>('[role="treeitem"]'),
      );
      const currentItem = (event.target as HTMLElement).closest<HTMLElement>(
        '[role="treeitem"]',
      );
      if (currentItem === null) return;
      const idx = items.indexOf(currentItem);
      if (idx === -1) return;
      const next = direction === "next" ? items[idx + 1] : items[idx - 1];
      if (next === undefined) return;
      event.preventDefault();
      const focusable = next.querySelector<HTMLElement>(
        'a, button, input, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    },
    [],
  );

  return (
    <>
      {children.length === 0 ? (
        <div className="px-3 text-[13px] text-ink-tertiary flex flex-col gap-2">
          <p>まだディレクトリがありません</p>
          <button
            type="button"
            disabled={root === undefined}
            className="self-start text-accent text-[13px] hover:underline disabled:opacity-55 disabled:cursor-not-allowed disabled:no-underline"
            onClick={() => {
              if (root === undefined) return;
              setDialog({
                kind: "createChild",
                parentId: root.id as unknown as string,
                parentName: "（ルート）",
              });
            }}
          >
            + ディレクトリを作成
          </button>
        </div>
      ) : (
        <div
          ref={treeRef}
          role="tree"
          className="list-none m-0 p-0"
          aria-label="ディレクトリツリー"
        >
          {children.map((node) => (
            <DirectoryTreeNodeView
              key={node.id as unknown as string}
              node={node}
              depth={1}
              isExpanded={isExpanded}
              toggleExpand={toggleExpand}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              renameError={renameError}
              setRenameError={setRenameError}
              focusSibling={focusSibling}
              tree={tree}
              setDialog={setDialog}
            />
          ))}
        </div>
      )}

      {dialog.kind === "createChild" ? (
        <CreateDirectoryDialog
          open
          parentId={dialog.parentId}
          parentName={dialog.parentName}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "move" ? (
        <MoveDirectoryDialog
          open
          tree={tree}
          directoryId={dialog.directoryId}
          directoryName={dialog.directoryName}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteDirectoryDialog
          open
          directoryId={dialog.directoryId}
          directoryName={dialog.directoryName}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
    </>
  );
}

type NodeViewProps = Readonly<{
  node: DirectoryTreeNode;
  depth: number;
  isExpanded: (id: string) => boolean;
  toggleExpand: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  renameError: { id: string; error: SerializedError } | null;
  setRenameError: (
    error: { id: string; error: SerializedError } | null,
  ) => void;
  focusSibling: (
    event: KeyboardEvent<HTMLElement>,
    direction: "next" | "prev",
  ) => void;
  tree: readonly DirectoryTreeNode[];
  setDialog: (state: DialogState) => void;
}>;

function DirectoryTreeNodeView({
  node,
  depth,
  isExpanded,
  toggleExpand,
  renamingId,
  setRenamingId,
  renameError,
  setRenameError,
  focusSibling,
  tree,
  setDialog,
}: NodeViewProps) {
  const id = node.id as unknown as string;
  const hasChildren = node.children.length > 0;
  const expanded = isExpanded(id);
  const isRenaming = renamingId === id;
  const errorForThis =
    renameError !== null && renameError.id === id ? renameError.error : null;

  const itemRef = useRef<HTMLDivElement | null>(null);
  const wasRenamingRef = useRef(false);
  const errorId = useId();
  // When inline rename ends (commit / cancel) restore focus to the row's
  // link so keyboard users do not lose their place in the tree. Only act
  // when focus actually landed on <body> (the browser fallback after the
  // input unmounted). If the user tabbed/clicked elsewhere while the
  // rename was committing, respect their intent and leave focus alone.
  useEffect(() => {
    if (wasRenamingRef.current && !isRenaming) {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        const link = itemRef.current?.querySelector<HTMLElement>("a");
        link?.focus();
      }
    }
    wasRenamingRef.current = isRenaming;
  }, [isRenaming]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isRenaming) return;
    // Each treeitem div has its own onKeyDown. Without stopPropagation the
    // bubbling event would also fire on every ancestor treeitem, so F2 /
    // Delete on a deep node would target the level-1 ancestor instead. We
    // stop propagation on every handled key.
    if (event.key === "ArrowDown") {
      event.stopPropagation();
      focusSibling(event, "next");
      return;
    }
    if (event.key === "ArrowUp") {
      event.stopPropagation();
      focusSibling(event, "prev");
      return;
    }
    if (event.key === "ArrowRight") {
      if (hasChildren && !expanded) {
        event.preventDefault();
        event.stopPropagation();
        toggleExpand(id);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      if (hasChildren && expanded) {
        event.preventDefault();
        event.stopPropagation();
        toggleExpand(id);
      }
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      setRenameError(null);
      setRenamingId(id);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      setDialog({ kind: "delete", directoryId: id, directoryName: node.name });
      return;
    }
  };

  return (
    <div
      ref={itemRef}
      role="treeitem"
      aria-level={depth}
      aria-expanded={hasChildren ? expanded : undefined}
      // tabIndex=-1 keeps the treeitem programmatically focusable while staying
      // out of the natural tab cycle — focus normally lands on the inner Link
      // or action button (WAI-ARIA Tree pattern v1 subset; see ADR-006).
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div
        className={TREE_ITEM_ROW}
        style={{ paddingLeft: `${depth === 1 ? 0 : (depth - 1) * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "折りたたむ" : "展開する"}
            className={TREE_DISCLOSURE}
            onClick={(e) => {
              e.preventDefault();
              toggleExpand(id);
            }}
            tabIndex={-1}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
        ) : (
          <span className="inline-block w-5 h-5 shrink-0" aria-hidden="true" />
        )}

        {isRenaming ? (
          <InlineRenameInput
            directoryId={id}
            initialName={node.name}
            errorId={errorForThis !== null ? errorId : undefined}
            onDone={() => {
              setRenamingId(null);
            }}
            onError={(error) => setRenameError({ id, error })}
            onCommitSuccess={() => {
              setRenameError(null);
            }}
          />
        ) : (
          <Link
            to="/"
            // Filter-reset pattern: only `directoryId` is set; the rest of
            // the filter slots fall back to schema defaults via HOME_SEARCH.
            search={{ ...HOME_SEARCH, directoryId: id }}
            className={TREE_ITEM_LINK}
            activeProps={ACTIVE_NAV_PROPS}
          >
            <span className="truncate">{node.name}</span>
          </Link>
        )}

        {!isRenaming ? (
          <DirectoryActionsMenu
            triggerLabel={`${node.name} の操作`}
            onCreateChild={() =>
              setDialog({
                kind: "createChild",
                parentId: id,
                parentName: node.name,
              })
            }
            onRename={() => {
              setRenameError(null);
              setRenamingId(id);
            }}
            onMove={() =>
              setDialog({
                kind: "move",
                directoryId: id,
                directoryName: node.name,
              })
            }
            onDelete={() =>
              setDialog({
                kind: "delete",
                directoryId: id,
                directoryName: node.name,
              })
            }
          />
        ) : null}
      </div>

      {errorForThis !== null ? (
        <p id={errorId} className={TREE_ITEM_ERROR} role="alert">
          {displayError(errorForThis)}
        </p>
      ) : null}

      {hasChildren && expanded ? (
        // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA tree pattern uses role="group" on a generic container; <fieldset> carries form semantics that are inappropriate here
        <div role="group" className="list-none m-0 p-0">
          {node.children.map((child) => (
            <DirectoryTreeNodeView
              key={child.id as unknown as string}
              node={child}
              depth={depth + 1}
              isExpanded={isExpanded}
              toggleExpand={toggleExpand}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              renameError={renameError}
              setRenameError={setRenameError}
              focusSibling={focusSibling}
              tree={tree}
              setDialog={setDialog}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type InlineRenameInputProps = Readonly<{
  directoryId: string;
  initialName: string;
  /** Element id of an associated `role="alert"` error message, if any. */
  errorId?: string | undefined;
  onDone: () => void;
  onError: (error: SerializedError) => void;
  onCommitSuccess: () => void;
}>;

function InlineRenameInput({
  directoryId,
  initialName,
  errorId,
  onDone,
  onError,
  onCommitSuccess,
}: InlineRenameInputProps) {
  const router = useRouter();
  const renameDirectory = useServerFn(renameDirectoryFn);
  const [value, setValue] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, []);

  // Enter → commit() triggers `disabled=true` (isPending) on the input, which
  // causes the browser to blur it — and onBlur={commit} would then fire a
  // second commit in the same event loop. Guard with a ref so commit is a
  // single-shot per InlineRenameInput instance.
  const committedRef = useRef(false);

  const commit = () => {
    if (committedRef.current) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      committedRef.current = true;
      onDone();
      return;
    }
    if (trimmed === initialName) {
      committedRef.current = true;
      onDone();
      return;
    }
    committedRef.current = true;
    startTransition(async () => {
      try {
        await renameDirectory({
          data: { directoryId, newName: trimmed },
        });
        await router.invalidate();
        onCommitSuccess();
        onDone();
      } catch (e) {
        // Keep the input mounted so the user can correct the value;
        // aria-describedby/aria-invalid (set on the input by the parent)
        // now points at a real, visible error message. Reset the
        // single-shot guard so a retry submission can proceed.
        onError(extractSerializedError(e));
        committedRef.current = false;
      }
    });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
          return;
        }
      }}
      maxLength={DIRECTORY_NAME_MAX_LENGTH}
      disabled={isPending}
      aria-label="ディレクトリ名"
      aria-invalid={errorId !== undefined ? true : undefined}
      aria-describedby={errorId}
      className={TREE_ITEM_RENAME_INPUT}
    />
  );
}
