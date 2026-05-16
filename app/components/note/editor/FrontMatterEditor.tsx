"use client";

import { useId } from "react";
import type { FrontMatterMode } from "./editorState";

/**
 * FrontMatter pane: structured editor for the known keys (`title`,
 * `date`, `tags`, `description`, `slug`) plus a raw-JSON toggle for
 * everything else. Per ADR-003 we deliberately do NOT support YAML —
 * the raw mode is plain JSON because the wire boundary already uses
 * JSON (`frontMatterJson` per ADR-008).
 *
 * `tags` is rendered as a comma-separated `<input>` because the
 * structured payload type is `string[]`. The orchestrator converts the
 * comma list back into a real array via `setFrontMatterField`.
 */
export type FrontMatterEditorProps = Readonly<{
  mode: FrontMatterMode;
  parsed: Record<string, unknown>;
  rawJson: string;
  parseError: string | null;
  onToggleMode: () => void;
  onSetField: (key: string, value: unknown) => void;
  onSetRawJson: (value: string) => void;
  disabled?: boolean;
}>;

const KNOWN_KEYS = ["title", "date", "tags", "description", "slug"] as const;

type KnownKey = (typeof KNOWN_KEYS)[number];

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

function asTagList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").join(", ");
  }
  return "";
}

function parseTagList(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function FrontMatterEditor(props: FrontMatterEditorProps) {
  const {
    mode,
    parsed,
    rawJson,
    parseError,
    onToggleMode,
    onSetField,
    onSetRawJson,
    disabled,
  } = props;

  const titleId = useId();
  const dateId = useId();
  const tagsId = useId();
  const descId = useId();
  const slugId = useId();
  const rawId = useId();

  const fieldId: Record<KnownKey, string> = {
    title: titleId,
    date: dateId,
    tags: tagsId,
    description: descId,
    slug: slugId,
  };

  return (
    <div className="front-matter-editor">
      <div className="front-matter-mode-toggle">
        <button
          type="button"
          className="pill-btn"
          onClick={onToggleMode}
          aria-pressed={mode === "raw"}
          disabled={disabled}
        >
          {mode === "raw" ? "構造編集に戻す" : "生編集（JSON）"}
        </button>
        {mode === "raw" && parseError !== null ? (
          <span className="form-error" role="alert">
            JSON エラー: {parseError}
          </span>
        ) : null}
      </div>
      {mode === "structured" ? (
        <div className="front-matter-known-form">
          <div className="field">
            <label htmlFor={fieldId.title}>title</label>
            <input
              id={fieldId.title}
              type="text"
              value={asString(parsed.title)}
              onChange={(e) => onSetField("title", e.target.value)}
              disabled={disabled}
              placeholder="ノートのタイトル（FrontMatter）"
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId.date}>date</label>
            <input
              id={fieldId.date}
              type="date"
              value={asString(parsed.date)}
              onChange={(e) => onSetField("date", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId.tags}>tags（カンマ区切り）</label>
            <input
              id={fieldId.tags}
              type="text"
              value={asTagList(parsed.tags)}
              onChange={(e) => onSetField("tags", parseTagList(e.target.value))}
              disabled={disabled}
              placeholder="例: idea, draft"
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId.description}>description</label>
            <textarea
              id={fieldId.description}
              value={asString(parsed.description)}
              onChange={(e) => onSetField("description", e.target.value)}
              disabled={disabled}
              rows={3}
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId.slug}>slug</label>
            <input
              id={fieldId.slug}
              type="text"
              value={asString(parsed.slug)}
              onChange={(e) => onSetField("slug", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={rawId}>FrontMatter（JSON）</label>
          <textarea
            id={rawId}
            value={rawJson}
            onChange={(e) => onSetRawJson(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            rows={12}
            aria-invalid={parseError !== null}
          />
          {parseError !== null ? (
            <p className="form-error" role="alert">
              JSON が解析できません: {parseError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
