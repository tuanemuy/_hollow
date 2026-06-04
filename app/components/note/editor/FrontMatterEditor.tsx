"use client";

import { useEffect, useId, useState } from "react";
import {
  field,
  fieldControl,
  fieldLabel,
  fieldTextarea,
  formError,
  pillBtn,
} from "@/components/common/styles";
import type { FrontMatterError, FrontMatterMode } from "./editorState";

/**
 * Map a structured `FrontMatterError` to a localized message. The
 * reducer is React- and language-agnostic; localization lives here so
 * future translation surfaces (or a different UI shell) can reuse the
 * structured error without re-parsing message text.
 */
function displayFrontMatterError(
  error: FrontMatterError,
  mode: FrontMatterMode,
): string {
  switch (error.kind) {
    case "duplicateKey":
      return `キー '${error.key}' は既に存在します`;
    case "emptyKey":
      return "キー名は空にできません";
    case "json":
      return mode === "raw"
        ? `JSON が解析できません: ${error.message}`
        : `JSON エラー: ${error.message}`;
  }
}

/**
 * FrontMatter pane: generic key-value editor for any keys present in
 * the FrontMatter record + a raw-JSON toggle (Issue #230). The editor
 * does not assume any fixed schema — keys already on the note are
 * rendered as-is, and new keys can be added freely.
 *
 * Array / nested-object values cannot be edited in structured mode
 * (the input is a flat `<input>`); they are shown read-only with a CTA
 * to switch to raw JSON mode. The row's delete button stays enabled so
 * a legacy `frontMatter.tags` array can still be removed without
 * opening raw mode.
 *
 * `SUGGESTED_KEYS` powers a `<datalist>` for the key input. We only
 * suggest keys the application reads (`date` via `parseFrontMatterDate`)
 * or that are conventional in Markdown front matter (`title`,
 * `description`, `slug`). `tags` / `aliases` / `publish` are
 * deliberately excluded because the application does not consume them
 * here — the canonical tag source is hashtags + the tag chip input
 * (ADR-001 / ADR-002).
 *
 * Per ADR-003 the raw mode is JSON, not YAML — the wire boundary
 * already uses JSON (`frontMatterJson` per ADR-008 of Issue #1).
 */
export type FrontMatterEditorProps = Readonly<{
  mode: FrontMatterMode;
  parsed: Record<string, unknown>;
  rawJson: string;
  parseError: FrontMatterError | null;
  onToggleMode: () => void;
  onSetField: (key: string, value: unknown) => void;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onAddKey: (key: string) => void;
  onSetRawJson: (value: string) => void;
  disabled?: boolean;
}>;

const SUGGESTED_KEYS = ["date", "description", "title", "slug"] as const;

type ValueShape =
  | { kind: "string"; text: string }
  | { kind: "number"; text: string }
  | { kind: "boolean"; text: string }
  | { kind: "null" }
  | { kind: "complex"; label: "array" | "object" };

function classifyValue(value: unknown): ValueShape {
  if (value === null) return { kind: "null" };
  if (value === undefined) return { kind: "string", text: "" };
  if (typeof value === "string") return { kind: "string", text: value };
  if (typeof value === "number") return { kind: "number", text: String(value) };
  if (typeof value === "boolean")
    return { kind: "boolean", text: String(value) };
  if (Array.isArray(value)) return { kind: "complex", label: "array" };
  if (typeof value === "object") return { kind: "complex", label: "object" };
  return { kind: "string", text: String(value) };
}

type KeyRowProps = Readonly<{
  fmKey: string;
  value: unknown;
  datalistId: string;
  /**
   * Set of keys currently in the FrontMatter — used to pre-check
   * duplicate renames on the UI side so a reject path does not strand
   * a stale `keyBuffer` (W-FE-002). Excludes the row's own `fmKey`.
   */
  siblingKeys: ReadonlySet<string>;
  onRenameKey: (oldKey: string, newKey: string) => void;
  onSetField: (key: string, value: unknown) => void;
  disabled: boolean | undefined;
}>;

function KeyRow({
  fmKey,
  value,
  datalistId,
  siblingKeys,
  onRenameKey,
  onSetField,
  disabled,
}: KeyRowProps) {
  // Buffer the key input locally so typing intermediate names does not
  // dispatch per-keystroke renames (which would scramble key order and
  // pollute autosave). We commit on blur / Enter via `commitKey`.
  const [keyBuffer, setKeyBuffer] = useState(fmKey);
  useEffect(() => {
    setKeyBuffer(fmKey);
  }, [fmKey]);

  const shape = classifyValue(value);
  const keyInputId = useId();
  const valueInputId = useId();

  const commitKey = () => {
    const trimmed = keyBuffer.trim();
    if (trimmed === fmKey) {
      if (trimmed !== keyBuffer) setKeyBuffer(trimmed);
      return;
    }
    if (trimmed.length === 0) {
      setKeyBuffer(fmKey);
      return;
    }
    // W-FE-002: pre-check duplicates on the UI side. The reducer also
    // rejects, but if the rejected name stayed in `keyBuffer` the next
    // blur would re-fire the same reject. Roll the buffer back to the
    // canonical key so the user sees a clean revert.
    if (siblingKeys.has(trimmed)) {
      setKeyBuffer(fmKey);
      // We still dispatch so the reducer surfaces the structured error
      // (the UI shows the inline message above). The reducer's
      // duplicate-key branch leaves `frontMatter` untouched.
      onRenameKey(fmKey, trimmed);
      return;
    }
    onRenameKey(fmKey, trimmed);
  };

  return (
    <div
      className="flex flex-wrap items-start gap-2 mb-3"
      data-value-kind={shape.kind}
    >
      <div className="flex-1 min-w-[160px]">
        <label htmlFor={keyInputId} className={`${fieldLabel} sr-only`}>
          キー
        </label>
        <input
          id={keyInputId}
          type="text"
          value={keyBuffer}
          onChange={(e) => setKeyBuffer(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // W-FE-001: ignore Enter from IME conversion confirm so
              // Japanese variant selection doesn't trigger a commit
              // mid-typing. Same pattern as `Dialog.tsx` / `NotePickerDialog.tsx`.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          list={datalistId}
          disabled={disabled}
          placeholder="キー名"
          className={`${fieldControl} font-mono text-mono`}
          aria-label="FrontMatter キー"
        />
      </div>
      <div className="flex-[2] min-w-[200px]">
        <label htmlFor={valueInputId} className={`${fieldLabel} sr-only`}>
          値
        </label>
        {shape.kind === "complex" ? (
          <div
            id={valueInputId}
            className={`${fieldControl} flex items-center gap-2 text-ink-secondary`}
            aria-disabled="true"
          >
            <span className="inline-flex items-center px-2 py-[2px] rounded-xs bg-surface-hover text-xs font-mono">
              {shape.label}
            </span>
            <span className="text-sm">
              複雑な値です。生編集（JSON）で編集してください。
            </span>
          </div>
        ) : (
          <input
            id={valueInputId}
            type="text"
            value={shape.kind === "null" ? "" : shape.text}
            onChange={(e) => onSetField(fmKey, e.target.value)}
            disabled={disabled}
            placeholder={shape.kind === "null" ? "null" : ""}
            className={fieldControl}
            aria-label={`${fmKey} の値`}
          />
        )}
        {shape.kind === "number" || shape.kind === "boolean" ? (
          <p className="text-ink-secondary text-[12px] mt-1">
            構造編集では文字列化されます。型を保持するには raw
            モード（JSON）で編集してください。
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className={pillBtn}
        onClick={() => onSetField(fmKey, undefined)}
        disabled={disabled}
        aria-label={`${fmKey} を削除`}
      >
        削除
      </button>
    </div>
  );
}

export function FrontMatterEditor(props: FrontMatterEditorProps) {
  const {
    mode,
    parsed,
    rawJson,
    parseError,
    onToggleMode,
    onSetField,
    onRenameKey,
    onAddKey,
    onSetRawJson,
    disabled,
  } = props;

  const rawId = useId();
  const datalistId = useId();
  const [newKeyBuffer, setNewKeyBuffer] = useState("");

  const entries = Object.entries(parsed);
  const allKeys = new Set(entries.map(([k]) => k));

  const commitNewKey = () => {
    const trimmed = newKeyBuffer.trim();
    if (trimmed.length === 0) return;
    // W-FE-003: pre-check duplicates on the UI side so a rejected add
    // does not wipe the user's input. The reducer's reject branch is
    // still authoritative for the inline error message.
    if (allKeys.has(trimmed)) {
      onAddKey(trimmed);
      return;
    }
    onAddKey(trimmed);
    setNewKeyBuffer("");
  };

  // ADR-003 (Issue #230): switching modes while a key input has focus
  // would unmount the row and lose the pending buffer. Force the active
  // element to blur first so its commit path runs (including the local
  // duplicate-revert path) before the structured tree disappears.
  // Mirrors the same handling at `NoteEditor` level when the editor
  // mode (HTML / WYSIWYG / FrontMatter) is switched.
  const handleToggleMode = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    onToggleMode();
  };

  return (
    <div className="mt-4 rounded-lg border border-hairline bg-surface-elevated p-5">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          className={pillBtn}
          onClick={handleToggleMode}
          aria-pressed={mode === "raw"}
          disabled={disabled}
        >
          {mode === "raw" ? "構造編集に戻す" : "生編集（JSON）"}
        </button>
        {/* W-FE-007: permanent `aria-live` region so screen readers
            announce reject errors that appear / disappear during
            structured edits. The inner `role="alert"` element is the
            assertive surface for the JSON-only path (raw mode), and the
            polite container catches structured-mode transitions. */}
        <div
          className="flex items-center"
          aria-live="polite"
          aria-atomic="true"
        >
          {parseError !== null ? (
            <span className={formError} role="alert">
              {displayFrontMatterError(parseError, mode)}
            </span>
          ) : null}
        </div>
      </div>
      {mode === "structured" ? (
        <div className="flex flex-col">
          <datalist id={datalistId}>
            {SUGGESTED_KEYS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          {entries.length === 0 ? (
            <p className="text-ink-secondary text-sm mb-3">
              FrontMatter は空です。下のフォームからキーを追加できます。
            </p>
          ) : (
            entries.map(([k, v]) => {
              const siblings = new Set(allKeys);
              siblings.delete(k);
              return (
                <KeyRow
                  key={k}
                  fmKey={k}
                  value={v}
                  datalistId={datalistId}
                  siblingKeys={siblings}
                  onRenameKey={onRenameKey}
                  onSetField={onSetField}
                  disabled={disabled}
                />
              );
            })
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2 pt-3 border-t border-hairline">
            <input
              type="text"
              value={newKeyBuffer}
              onChange={(e) => setNewKeyBuffer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // W-FE-001: ignore IME conversion Enter.
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  e.preventDefault();
                  commitNewKey();
                }
              }}
              list={datalistId}
              disabled={disabled}
              placeholder="新しいキー名"
              className={`${fieldControl} flex-1 min-w-[160px] font-mono text-mono`}
              aria-label="追加するキー名"
            />
            <button
              type="button"
              className={pillBtn}
              onClick={commitNewKey}
              disabled={disabled || newKeyBuffer.trim().length === 0}
            >
              キーを追加
            </button>
          </div>
        </div>
      ) : (
        <div className={field}>
          <label htmlFor={rawId} className={fieldLabel}>
            FrontMatter（JSON）
          </label>
          <textarea
            id={rawId}
            value={rawJson}
            onChange={(e) => onSetRawJson(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            rows={12}
            aria-invalid={parseError !== null}
            className={`${fieldControl} ${fieldTextarea}`}
          />
          {parseError !== null ? (
            <p className={formError} role="alert">
              {displayFrontMatterError(parseError, mode)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
