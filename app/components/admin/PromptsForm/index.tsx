"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import type { PromptDTO } from "@/core/application/dto/adminSettings";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { updatePromptTemplateFn } from "./action";

type PromptDescriptor = {
  purpose: string;
  title: string;
  description: string;
};

const PROMPT_DESCRIPTORS: readonly PromptDescriptor[] = [
  {
    purpose: "ingestion_structuring",
    title: "取り込み構造化プロンプト",
    description: "アップロード画像・PDF からテキストと見出し構造を抽出",
  },
  {
    purpose: "title_generation",
    title: "タイトル生成プロンプト",
    description: "ノート本文から簡潔な日本語タイトルを生成",
  },
  {
    purpose: "directory_suggestion",
    title: "ディレクトリ提案プロンプト",
    description: "ノート内容と既存ディレクトリから最適な配置を提案",
  },
];

function PromptCard({
  descriptor,
  initial,
}: {
  descriptor: PromptDescriptor;
  initial: PromptDTO | undefined;
}) {
  const router = useRouter();
  const update = useServerFn(updatePromptTemplateFn);
  const textId = useId();
  const variablesId = useId();

  const [text, setText] = useState(initial?.text ?? "");
  const [variables, setVariables] = useState(
    (initial?.expectedVariables ?? []).join(", "),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const onSave = () => {
    startTransition(async () => {
      setError(null);
      try {
        const parsedVariables = variables
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        await update({
          data: {
            purpose: descriptor.purpose,
            text,
            expectedVariables: parsedVariables,
          },
        });
        await router.invalidate();
        setSavedAt(Date.now());
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const fieldErrors =
    error?.kind === "validation" ? error.fieldErrors : undefined;
  const summary = error !== null ? displayError(error) : "";

  return (
    <article className="admin-prompt-card">
      <header className="admin-prompt-card-header">
        <div>
          <h3 className="admin-prompt-card-title">{descriptor.title}</h3>
          <p className="admin-prompt-card-meta">{descriptor.description}</p>
        </div>
      </header>
      <div className="admin-field">
        <label className="admin-field-label" htmlFor={textId}>
          プロンプト本文
        </label>
        <textarea
          id={textId}
          className="admin-textarea"
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          disabled={isPending}
          required
        />
        {fieldErrors?.text?.[0] !== undefined ? (
          <p className="admin-field-error">{fieldErrors.text[0]}</p>
        ) : null}
      </div>
      <div className="admin-field">
        <label className="admin-field-label" htmlFor={variablesId}>
          期待するプレースホルダ（カンマ区切り）
        </label>
        <input
          id={variablesId}
          type="text"
          className="admin-input mono"
          value={variables}
          onChange={(event) => setVariables(event.target.value)}
          placeholder="content, existingDirectories"
          disabled={isPending}
        />
        <p className="admin-field-hint">
          本文中の <code className="admin-code">{"{{name}}"}</code>{" "}
          と一致させる必要があります。
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--admin-space-3)",
          alignItems: "center",
          justifyContent: "flex-end",
          marginTop: "var(--admin-space-3)",
        }}
      >
        {savedAt !== null && error === null ? (
          <span
            style={{
              color: "var(--admin-color-success)",
              fontSize: "var(--admin-text-xs)",
            }}
          >
            保存しました
          </span>
        ) : null}
        {summary !== "" && fieldErrors === undefined ? (
          <span
            style={{
              color: "var(--admin-color-error)",
              fontSize: "var(--admin-text-xs)",
            }}
          >
            {summary}
          </span>
        ) : null}
        <button
          type="button"
          className="admin-btn primary"
          onClick={onSave}
          disabled={isPending || text.trim().length === 0}
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </article>
  );
}

export function PromptsForm({
  prompts,
}: {
  prompts: Readonly<Record<string, PromptDTO>>;
}) {
  return (
    <div className="admin-prompt-grid">
      {PROMPT_DESCRIPTORS.map((descriptor) => (
        <PromptCard
          key={descriptor.purpose}
          descriptor={descriptor}
          initial={prompts[descriptor.purpose]}
        />
      ))}
    </div>
  );
}
