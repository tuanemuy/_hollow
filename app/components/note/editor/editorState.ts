/**
 * Pure reducer / state model for the note editor (P12).
 *
 * Lives in its own React-agnostic module so the full state transition
 * graph is exercisable from vitest. The orchestrator `NoteEditor.tsx`
 * binds this reducer to `useReducer` but never adds logic outside the
 * exported actions defined here.
 *
 * Design pillars (see ADR-005 / ADR-008):
 * - FrontMatter is held twice: as a parsed `Record<string, unknown>`
 *   (`frontMatter`) and as the user-visible raw JSON string
 *   (`frontMatterRawJson`). Toggling between structured-edit and raw
 *   modes is reversible; raw-mode parse errors keep the dirty value so
 *   typing-in-progress is never lost.
 * - `dirtyKeys` is a `ReadonlySet` so autosave can ask "is anything
 *   dirty?" without diffing the entire state. `autosaveSuccess` clears
 *   it; field setters add to it.
 * - The reducer never throws. Invalid FrontMatter raw text records a
 *   `frontMatterJsonError` string and disables the save button at the
 *   UI level instead of failing the action.
 * - `setMode` to a disabled mode (`wysiwyg-disabled`) is a no-op so the
 *   tab can still be rendered as a placeholder without a guard at the
 *   call-site.
 */

import type { SerializedError } from "@/core/presentation/errorResponse";

export type EditorMode = "html" | "frontMatter" | "wysiwyg-disabled";

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

export type EditorState = Readonly<{
  mode: EditorMode;
  title: string;
  contentHtml: string;
  frontMatter: Record<string, unknown>;
  frontMatterMode: FrontMatterMode;
  frontMatterRawJson: string;
  frontMatterJsonError: string | null;
  directoryId: string | null;
  pendingDirectoryName: string | null;
  tagInput: string;
  mediaInsertions: ReadonlyArray<MediaInsertion>;
  autosave: AutosaveStatus;
  dirtyKeys: ReadonlySet<DirtyKey>;
  editLock: EditLockState;
}>;

export type EditorAction =
  | Readonly<{ type: "setTitle"; value: string }>
  | Readonly<{ type: "setContent"; value: string }>
  | Readonly<{ type: "setFrontMatterField"; key: string; value: unknown }>
  | Readonly<{ type: "setFrontMatterRawJson"; value: string }>
  | Readonly<{ type: "toggleFrontMatterMode" }>
  | Readonly<{ type: "setDirectory"; directoryId: string | null }>
  | Readonly<{ type: "setPendingDirectoryName"; value: string | null }>
  | Readonly<{ type: "setMode"; mode: EditorMode }>
  | Readonly<{ type: "setTagInput"; value: string }>
  | Readonly<{ type: "autosaveStart" }>
  | Readonly<{ type: "autosaveSuccess"; at: number }>
  | Readonly<{ type: "autosaveError"; error: SerializedError }>
  | Readonly<{ type: "mediaInsertionAdded"; insertion: MediaInsertion }>
  | Readonly<{
      type: "editLockAcquired";
      lockId: string | null;
      expiresAt: number | null;
    }>
  | Readonly<{ type: "editLockDenied"; expiresAt: number | null }>
  | Readonly<{ type: "editLockReleased" }>;

export type EditorInit = Readonly<{
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
    mode: "html",
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
  };
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
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "FrontMatter must be a JSON object" };
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
      if (action.mode === "wysiwyg-disabled") return state;
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

export function snapshotForSubmit(state: EditorState): EditorSubmitSnapshot {
  return {
    title: state.title,
    contentHtml: state.contentHtml,
    frontMatterJson: JSON.stringify(state.frontMatter),
    tagNames: parseTagInput(state.tagInput),
    directoryId: state.directoryId,
  };
}
