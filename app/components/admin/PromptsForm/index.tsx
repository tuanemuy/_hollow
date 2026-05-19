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

const FIELD_LABEL_CLASS = "block text-sm font-medium text-ink mb-[6px]";
const FIELD_HINT_CLASS = "text-xs text-ink-tertiary mt-1";
const FIELD_ERROR_CLASS = "text-xs text-error mt-1";
const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const INPUT_MONO_CLASS = `${INPUT_CLASS} font-mono`;
const TEXTAREA_CLASS =
  "w-full min-h-[140px] px-3 py-[10px] bg-surface border border-transparent rounded-md font-mono text-xs text-ink leading-relaxed outline-none resize-y transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const BTN_PRIMARY_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed";
const CODE_INLINE_CLASS =
  "font-mono text-xs px-[5px] py-[1px] bg-surface rounded-xs";

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
    <article className="border border-hairline rounded-lg p-5">
      <header className="flex justify-between items-baseline gap-3 mb-3">
        <div>
          <h3 className="text-md font-medium m-0">{descriptor.title}</h3>
          <p className="text-xs text-ink-tertiary mt-[2px]">
            {descriptor.description}
          </p>
        </div>
      </header>
      <div className="mb-4">
        <label className={FIELD_LABEL_CLASS} htmlFor={textId}>
          プロンプト本文
        </label>
        <textarea
          id={textId}
          className={TEXTAREA_CLASS}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          disabled={isPending}
          required
        />
        {fieldErrors?.text?.[0] !== undefined ? (
          <p className={FIELD_ERROR_CLASS}>{fieldErrors.text[0]}</p>
        ) : null}
      </div>
      <div className="mb-4">
        <label className={FIELD_LABEL_CLASS} htmlFor={variablesId}>
          期待するプレースホルダ（カンマ区切り）
        </label>
        <input
          id={variablesId}
          type="text"
          className={INPUT_MONO_CLASS}
          value={variables}
          onChange={(event) => setVariables(event.target.value)}
          placeholder="content, existingDirectories"
          disabled={isPending}
        />
        <p className={FIELD_HINT_CLASS}>
          本文中の <code className={CODE_INLINE_CLASS}>{"{{name}}"}</code>{" "}
          と一致させる必要があります。
        </p>
      </div>
      <div className="flex gap-3 items-center justify-end mt-3">
        {savedAt !== null && error === null ? (
          <span className="text-success text-xs">保存しました</span>
        ) : null}
        {summary !== "" && fieldErrors === undefined ? (
          <span className="text-error text-xs">{summary}</span>
        ) : null}
        <button
          type="button"
          className={BTN_PRIMARY_CLASS}
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
    <div className="grid grid-cols-1 gap-6">
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
