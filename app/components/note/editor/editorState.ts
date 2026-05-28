/**
 * Pure reducer / state model for the note editor (P12).
 *
 * Lives in its own React-agnostic module so the full state transition
 * graph is exercisable from vitest. The orchestrator `NoteEditor.tsx`
 * binds this reducer to `useReducer` but never adds logic outside the
 * exported actions defined here.
 *
 * Design pillars (see ADR-005 / ADR-008 and Issue #230 ADR-003):
 * - FrontMatter is a generic `Record<string, unknown>` of arbitrary
 *   keys — the editor does not assume any fixed schema. Keys present
 *   in the loaded note are rendered as-is; new keys can be added by
 *   the user. The parsed object and the user-visible raw JSON string
 *   (`frontMatterRawJson`) are kept in lockstep. Toggling between
 *   structured-edit and raw modes is reversible; raw-mode parse errors
 *   keep the dirty value so typing-in-progress is never lost.
 * - Key insertion order is preserved everywhere — `setFrontMatterField`
 *   keeps existing keys in place, `renameFrontMatterKey` rewrites the
 *   key at its original position (so a rename never reorders the list).
 *   The structured UI iterates `Object.entries(frontMatter)`, so order
 *   in state drives order on screen.
 * - `dirtyKeys` is a `ReadonlySet` so autosave can ask "is anything
 *   dirty?" without diffing the entire state. `autosaveSuccess` clears
 *   it; field setters add to it.
 * - The reducer never throws. Invalid FrontMatter raw text records a
 *   `frontMatterJsonError` string and disables the save button at the
 *   UI level instead of failing the action. Duplicate-key errors from
 *   `renameFrontMatterKey` / `addFrontMatterKey` use the same channel.
 * - `setMode` accepts any `EditorMode` literal. All four modes are
 *   fully wired (HTML / FrontMatter / WYSIWYG / inline). The WYSIWYG
 *   tab was previously rendered disabled (Issue #1 ADR-002) and is now
 *   enabled per Issue #9. The `inline` mode (Issue #233) supports
 *   "edit decorated text in place" by making text-bearing block
 *   elements (`<p>` / `<h1-6>` / `<li>` / `<td>` / `<th>` /
 *   `<blockquote>` / `<figcaption>` / `<caption>` / `<dt>` / `<dd>`)
 *   contentEditable while preserving structure via a MutationObserver.
 * - `EditorInit.surface: "new" | "edit"` picks the initial mode (Issue
 *   #233 ADR-001 / spec C1, C2): `new` → `wysiwyg`, `edit` → `inline`.
 *   The branching lives here so a single helper can be unit-tested.
 * - `wysiwygUnsupportedDetected` is a *latch*: dispatching it with an
 *   empty `tags` array is a no-op (Issue #37 ADR-005). This makes it
 *   safe for callers to fan-out detection without worrying that a late
 *   "no unsupported tags" signal could erase an earlier warning.
 */

import type { SerializedError } from "@/core/presentation/errorResponse";

export type EditorMode = "html" | "frontMatter" | "wysiwyg" | "inline";

/**
 * Render surface the editor is mounted on. Drives the initial mode
 * (Issue #233 ADR-001) and the set of mode tabs the user sees
 * (`EditorModeSwitch`):
 * - `"new"`  → starts in `wysiwyg`; tabs = `wysiwyg / frontMatter / html`
 * - `"edit"` → starts in `inline`;  tabs = `inline / frontMatter / html`
 */
export type EditorSurface = "new" | "edit";

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: number }
  | { kind: "error"; error: SerializedError };

export type EditLockState =
  | { state: "unknown"; lockId: null; expiresAt: null }
  | { state: "acquired"; lockId: string | null; expiresAt: number | null }
  | { state: "denied"; lockId: null; expiresAt: number | null }
  | { state: "released"; lockId: null; expiresAt: null };

export type DirtyKey =
  | "title"
  | "content"
  | "frontMatter"
  | "tags"
  | "directory";

export type MediaInsertion = Readonly<{
  id: string;
  url: string;
}>;

export type FrontMatterMode = "structured" | "raw";

/**
 * Structured error model for the FrontMatter editor (Issue #230).
 *
 * The reducer is React-agnostic and language-agnostic — it returns a
 * `kind`-tagged variant and the UI maps each variant to a localized
 * message via `displayFrontMatterError` (see `FrontMatterEditor.tsx`).
 *
 * - `json` covers raw-mode JSON parse / shape failures. The `message`
 *   carries the raw `JSON.parse` text (or our shape check) — the UI
 *   prefixes a Japanese label.
 * - `duplicateKey` is emitted by `renameFrontMatterKey` / `addFrontMatterKey`
 *   when the target name already exists.
 * - `emptyKey` is emitted when the rename / add target is the empty string.
 */
export type FrontMatterError =
  | Readonly<{ kind: "json"; message: string }>
  | Readonly<{ kind: "duplicateKey"; key: string }>
  | Readonly<{ kind: "emptyKey" }>;

export type EditorState = Readonly<{
  mode: EditorMode;
  title: string;
  contentHtml: string;
  frontMatter: Record<string, unknown>;
  frontMatterMode: FrontMatterMode;
  frontMatterRawJson: string;
  frontMatterJsonError: FrontMatterError | null;
  directoryId: string | null;
  pendingDirectoryName: string | null;
  tagInput: string;
  mediaInsertions: ReadonlyArray<MediaInsertion>;
  autosave: AutosaveStatus;
  dirtyKeys: ReadonlySet<DirtyKey>;
  editLock: EditLockState;
  wysiwygUnsupportedTags: readonly string[];
  wysiwygUnsupportedAck: boolean;
}>;

export type EditorAction =
  | Readonly<{ type: "setTitle"; value: string }>
  | Readonly<{ type: "setContent"; value: string }>
  | Readonly<{ type: "setFrontMatterField"; key: string; value: unknown }>
  | Readonly<{
      type: "renameFrontMatterKey";
      oldKey: string;
      newKey: string;
    }>
  | Readonly<{ type: "addFrontMatterKey"; key: string }>
  | Readonly<{ type: "setFrontMatterRawJson"; value: string }>
  | Readonly<{ type: "toggleFrontMatterMode" }>
  | Readonly<{ type: "clearFrontMatterError" }>
  | Readonly<{ type: "setDirectory"; directoryId: string | null }>
  | Readonly<{ type: "setPendingDirectoryName"; value: string | null }>
  | Readonly<{ type: "setMode"; mode: EditorMode }>
  | Readonly<{ type: "setTagInput"; value: string }>
  | Readonly<{ type: "autosaveStart" }>
  | Readonly<{ type: "autosaveSuccess"; at: number }>
  | Readonly<{ type: "autosaveError"; error: SerializedError }>
  | Readonly<{ type: "autosaveDiscarded" }>
  | Readonly<{ type: "mediaInsertionAdded"; insertion: MediaInsertion }>
  | Readonly<{
      type: "editLockAcquired";
      lockId: string | null;
      expiresAt: number | null;
    }>
  | Readonly<{ type: "editLockDenied"; expiresAt: number | null }>
  | Readonly<{ type: "editLockReleased" }>
  | Readonly<{
      type: "wysiwygUnsupportedDetected";
      tags: readonly string[];
    }>
  | Readonly<{ type: "wysiwygUnsupportedAck" }>;

export type EditorInit = Readonly<{
  surface: EditorSurface;
  title: string;
  contentHtml: string;
  frontMatter: Record<string, unknown>;
  directoryId: string | null;
  tagNames: readonly string[];
  editLock?: EditLockState;
}>;

const FRONT_MATTER_INDENT = 2;

const EMPTY_DIRTY: ReadonlySet<DirtyKey> = new Set();

const UNKNOWN_LOCK: EditLockState = {
  state: "unknown",
  lockId: null,
  expiresAt: null,
};

const RELEASED_LOCK: EditLockState = {
  state: "released",
  lockId: null,
  expiresAt: null,
};

export function stringifyFrontMatter(value: Record<string, unknown>): string {
  if (Object.keys(value).length === 0) return "{}";
  return JSON.stringify(value, null, FRONT_MATTER_INDENT);
}

export function createInitialEditorState(init: EditorInit): EditorState {
  return {
    mode: init.surface === "new" ? "wysiwyg" : "inline",
    title: init.title,
    contentHtml: init.contentHtml,
    frontMatter: init.frontMatter,
    frontMatterMode: "structured",
    frontMatterRawJson: stringifyFrontMatter(init.frontMatter),
    frontMatterJsonError: null,
    directoryId: init.directoryId,
    pendingDirectoryName: null,
    tagInput: init.tagNames.join(", "),
    mediaInsertions: [],
    autosave: { kind: "idle" },
    dirtyKeys: EMPTY_DIRTY,
    editLock: init.editLock ?? UNKNOWN_LOCK,
    wysiwygUnsupportedTags: [],
    wysiwygUnsupportedAck: false,
  };
}

function setsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  for (const item of b) {
    if (!aSet.has(item)) return false;
  }
  return true;
}

function addDirty(
  set: ReadonlySet<DirtyKey>,
  key: DirtyKey,
): ReadonlySet<DirtyKey> {
  if (set.has(key)) return set;
  const next = new Set(set);
  next.add(key);
  return next;
}

function withDirty(
  state: EditorState,
  key: DirtyKey,
  patch: Partial<EditorState>,
): EditorState {
  return {
    ...state,
    ...patch,
    dirtyKeys: addDirty(state.dirtyKeys, key),
    autosave:
      state.autosave.kind === "saving" ? state.autosave : { kind: "dirty" },
  };
}

function setFrontMatterFieldValue(
  current: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function tryParseFrontMatterJson(
  raw: string,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: FrontMatterError } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "json",
        message: e instanceof Error ? e.message : "Invalid JSON",
      },
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        kind: "json",
        message: "FrontMatter はオブジェクト形式の JSON である必要があります",
      },
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "setTitle": {
      if (state.title === action.value) return state;
      return withDirty(state, "title", { title: action.value });
    }
    case "setContent": {
      if (state.contentHtml === action.value) return state;
      return withDirty(state, "content", { contentHtml: action.value });
    }
    case "setFrontMatterField": {
      const nextFm = setFrontMatterFieldValue(
        state.frontMatter,
        action.key,
        action.value,
      );
      return withDirty(state, "frontMatter", {
        frontMatter: nextFm,
        frontMatterRawJson: stringifyFrontMatter(nextFm),
        frontMatterJsonError: null,
      });
    }
    case "renameFrontMatterKey": {
      // Same-key commits don't rename, but they MUST clear any pending
      // duplicate / empty error so the user can recover by re-typing the
      // original name (W-ST-003). The autosave gate is keyed on
      // `frontMatterJsonError !== null`, so a stale error here would
      // silently block saving even though the FrontMatter is consistent.
      if (action.oldKey === action.newKey) {
        if (state.frontMatterJsonError === null) return state;
        return { ...state, frontMatterJsonError: null };
      }
      if (!(action.oldKey in state.frontMatter)) return state;
      if (action.newKey.length === 0) {
        return {
          ...state,
          frontMatterJsonError: { kind: "emptyKey" },
        };
      }
      if (action.newKey in state.frontMatter) {
        return {
          ...state,
          frontMatterJsonError: { kind: "duplicateKey", key: action.newKey },
        };
      }
      const nextFm: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(state.frontMatter)) {
        if (k === action.oldKey) nextFm[action.newKey] = v;
        else nextFm[k] = v;
      }
      return withDirty(state, "frontMatter", {
        frontMatter: nextFm,
        frontMatterRawJson: stringifyFrontMatter(nextFm),
        frontMatterJsonError: null,
      });
    }
    case "addFrontMatterKey": {
      if (action.key.length === 0) {
        return {
          ...state,
          frontMatterJsonError: { kind: "emptyKey" },
        };
      }
      if (action.key in state.frontMatter) {
        return {
          ...state,
          frontMatterJsonError: { kind: "duplicateKey", key: action.key },
        };
      }
      const nextFm: Record<string, unknown> = { ...state.frontMatter };
      nextFm[action.key] = "";
      return withDirty(state, "frontMatter", {
        frontMatter: nextFm,
        frontMatterRawJson: stringifyFrontMatter(nextFm),
        frontMatterJsonError: null,
      });
    }
    case "setFrontMatterRawJson": {
      const parsed = tryParseFrontMatterJson(action.value);
      if (!parsed.ok) {
        return withDirty(state, "frontMatter", {
          frontMatterRawJson: action.value,
          frontMatterJsonError: parsed.error,
        });
      }
      return withDirty(state, "frontMatter", {
        frontMatterRawJson: action.value,
        frontMatter: parsed.value,
        frontMatterJsonError: null,
      });
    }
    case "toggleFrontMatterMode": {
      const nextMode: FrontMatterMode =
        state.frontMatterMode === "structured" ? "raw" : "structured";
      if (nextMode === "raw") {
        // ADR-003: a pending structured-mode rejection (duplicateKey /
        // emptyKey) must not be silently dropped by switching modes.
        // The current parsed object is in-sync (the reducer only updates
        // `frontMatter` on successful rename / add), so resync the raw
        // view from the in-sync parsed object — raw mode shows the
        // actual committed state while the UI keeps the inline error
        // message visible above the textarea.
        const hasStructuredError =
          state.frontMatterJsonError !== null &&
          state.frontMatterJsonError.kind !== "json";
        if (hasStructuredError) {
          return {
            ...state,
            frontMatterMode: nextMode,
            frontMatterRawJson: stringifyFrontMatter(state.frontMatter),
          };
        }
        return {
          ...state,
          frontMatterMode: nextMode,
          frontMatterRawJson: stringifyFrontMatter(state.frontMatter),
          frontMatterJsonError: null,
        };
      }
      const parsed = tryParseFrontMatterJson(state.frontMatterRawJson);
      if (!parsed.ok) {
        return {
          ...state,
          frontMatterMode: nextMode,
          frontMatterJsonError: parsed.error,
        };
      }
      return {
        ...state,
        frontMatterMode: nextMode,
        frontMatter: parsed.value,
        frontMatterJsonError: null,
      };
    }
    case "clearFrontMatterError": {
      if (state.frontMatterJsonError === null) return state;
      return { ...state, frontMatterJsonError: null };
    }
    case "setDirectory": {
      if (state.directoryId === action.directoryId) return state;
      return withDirty(state, "directory", {
        directoryId: action.directoryId,
        pendingDirectoryName: null,
      });
    }
    case "setPendingDirectoryName": {
      if (state.pendingDirectoryName === action.value) return state;
      return withDirty(state, "directory", {
        pendingDirectoryName: action.value,
        directoryId: action.value === null ? state.directoryId : null,
      });
    }
    case "setMode": {
      if (state.mode === action.mode) return state;
      return { ...state, mode: action.mode };
    }
    case "setTagInput": {
      if (state.tagInput === action.value) return state;
      return withDirty(state, "tags", { tagInput: action.value });
    }
    case "autosaveStart": {
      return { ...state, autosave: { kind: "saving" } };
    }
    case "autosaveSuccess": {
      return {
        ...state,
        autosave: { kind: "saved", savedAt: action.at },
        dirtyKeys: EMPTY_DIRTY,
      };
    }
    case "autosaveError": {
      return {
        ...state,
        autosave: { kind: "error", error: action.error },
      };
    }
    case "autosaveDiscarded": {
      // Issue #286: external reset action driven by the mode-switch
      // "discard" path in NoteEditor.onModeChange. Pairs with
      // useAutosave's `abortInFlight()`, which cancels any in-flight
      // saveDraft fetch via AbortController and then dispatches this
      // action so the AutosaveIndicator returns to `idle`. `dirtyKeys`
      // is intentionally preserved — the user's edits themselves are
      // not discarded; only the in-flight fetch and its UI status are.
      // The preserved dirty set lets the next autosave cycle resend the
      // content after the mode switches. `idle → idle` short-circuits to
      // avoid pointless re-renders (ADR-004 of Issue #286).
      if (state.autosave.kind === "idle") return state;
      return { ...state, autosave: { kind: "idle" } };
    }
    case "mediaInsertionAdded": {
      return {
        ...state,
        mediaInsertions: [...state.mediaInsertions, action.insertion],
      };
    }
    case "editLockAcquired": {
      return {
        ...state,
        editLock: {
          state: "acquired",
          lockId: action.lockId,
          expiresAt: action.expiresAt,
        },
      };
    }
    case "editLockDenied": {
      return {
        ...state,
        editLock: {
          state: "denied",
          lockId: null,
          expiresAt: action.expiresAt,
        },
      };
    }
    case "editLockReleased": {
      return { ...state, editLock: RELEASED_LOCK };
    }
    case "wysiwygUnsupportedDetected": {
      // Latch (Issue #37 / ADR-005): an empty `tags` dispatch never
      // mutates state. The detection helper runs once per `WysiwygEditor`
      // mount on the original HTML; if a caller ever re-runs detection
      // against the *post-edit* HTML (which TipTap may already have
      // flattened) we must not clear the warning — that would silently
      // release the autosave gate and lose the user's original markup.
      if (action.tags.length === 0) return state;
      // Set-equality comparison so callers don't need to keep tag order
      // stable. If the warning set is unchanged, return the current
      // state by reference so React skips downstream renders.
      if (setsEqual(state.wysiwygUnsupportedTags, action.tags)) return state;
      return {
        ...state,
        wysiwygUnsupportedTags: [...action.tags].sort(),
        wysiwygUnsupportedAck: false,
      };
    }
    case "wysiwygUnsupportedAck": {
      if (state.wysiwygUnsupportedAck) return state;
      return { ...state, wysiwygUnsupportedAck: true };
    }
  }
}

/**
 * Parse comma-separated tag input back into an ordered, de-duplicated
 * list of trimmed names. Pure helper exported for the orchestrator and
 * autosave hook to share a single tokenisation rule.
 */
export function parseTagInput(raw: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Snapshot the slice of state that autosave / explicit save send over
 * the wire. Computed in one place so the autosave hook and submit
 * handler stay in lockstep on which fields cross the boundary.
 */
export type EditorSubmitSnapshot = Readonly<{
  title: string;
  contentHtml: string;
  frontMatterJson: string;
  tagNames: readonly string[];
  directoryId: string | null;
}>;

/**
 * Slice of `EditorState` that the submit / autosave path actually
 * needs. Narrowing the input lets `useAutosave` build the snapshot
 * from destructured fields without `as EditorState` casts, and keeps
 * future additions to `snapshotForSubmit` visible at the type level.
 */
export type EditorSnapshotInput = Pick<
  EditorState,
  "title" | "contentHtml" | "frontMatter" | "tagInput" | "directoryId"
>;

export function snapshotForSubmit(
  input: EditorSnapshotInput,
): EditorSubmitSnapshot {
  return {
    title: input.title,
    contentHtml: input.contentHtml,
    frontMatterJson: JSON.stringify(input.frontMatter),
    tagNames: parseTagInput(input.tagInput),
    directoryId: input.directoryId,
  };
}
