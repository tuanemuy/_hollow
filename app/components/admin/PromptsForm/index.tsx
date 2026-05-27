"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import type {
  PromptDefaultDTO,
  PromptDTO,
} from "@/core/application/dto/adminSettings";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  resetAllPromptTemplatesFn,
  resetPromptTemplateFn,
  updatePromptTemplateFn,
} from "./action";

type PromptDescriptor = {
  /** Domain `PromptPurpose` value — matches the SSOT in `valueObject.ts`. */
  purpose: "structure" | "title" | "directory" | "metadata" | "ocr_assist";
  title: string;
  description: string;
};

// Domain SSOT: `PromptPurpose.values` (Issue #218 ADR-005). Keep this list
// in sync with `app/core/domain/adminSettings/valueObject.ts`.
const PROMPT_DESCRIPTORS: readonly PromptDescriptor[] = [
  {
    purpose: "structure",
    title: "取り込み構造化プロンプト",
    description: "アップロード画像・PDF からテキストと見出し構造を抽出",
  },
  {
    purpose: "title",
    title: "タイトル生成プロンプト",
    description: "ノート本文から簡潔な日本語タイトルを生成",
  },
  {
    purpose: "directory",
    title: "ディレクトリ提案プロンプト",
    description: "ノート内容と既存ディレクトリから最適な配置を提案",
  },
  {
    purpose: "metadata",
    title: "メタデータ抽出プロンプト",
    description: "ノートからタグや概要などのメタデータを抽出",
  },
  {
    purpose: "ocr_assist",
    title: "OCR 補助プロンプト",
    description: "OCR 結果の補正・整形に使用（OCR 機能は今後の実装で利用予定）",
  },
];

const FIELD_LABEL_CLASS = "block text-sm font-medium text-ink mb-[6px]";
const FIELD_HINT_CLASS = "text-xs text-ink-tertiary mt-1";
const FIELD_ERROR_CLASS = "text-xs text-error mt-1";
const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const INPUT_MONO_CLASS = `${INPUT_CLASS} font-mono`;
const TEXTAREA_CLASS =
  "w-full min-h-[140px] px-3 py-[10px] bg-surface border border-transparent rounded-md font-mono text-xs text-ink leading-relaxed outline-none resize-y transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const BTN_PRIMARY_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_GHOST_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-transparent text-ink-secondary text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-error-surface hover:not-disabled:text-error disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_DESTRUCTIVE_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-transparent text-ink-secondary text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-error-surface hover:not-disabled:text-error disabled:opacity-50 disabled:cursor-not-allowed";
const CODE_INLINE_CLASS =
  "font-mono text-xs px-[5px] py-[1px] bg-surface rounded-xs";
const BADGE_CLASS =
  "inline-flex items-center h-5 px-2 rounded-pill bg-accent-surface text-accent text-xs font-medium";

function PromptCard({
  descriptor,
  current,
  defaults,
}: {
  descriptor: PromptDescriptor;
  current: PromptDTO;
  defaults: PromptDefaultDTO;
}) {
  const router = useRouter();
  const update = useServerFn(updatePromptTemplateFn);
  const reset = useServerFn(resetPromptTemplateFn);
  const textId = useId();
  const variablesId = useId();

  // Only show the user's draft when an override is actively in place;
  // otherwise the textarea starts empty so the operator can confirm
  // visually that "no override = LLM provider default" is in effect.
  const [text, setText] = useState(current.isOverridden ? current.text : "");
  const [variables, setVariables] = useState(
    (current.isOverridden ? current.expectedVariables : []).join(", "),
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

  const onReset = () => {
    startTransition(async () => {
      setError(null);
      try {
        await reset({ data: { purpose: descriptor.purpose } });
        setText("");
        setVariables("");
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

  // ADR-002: built-in default is the empty string, surfaced to operators
  // through this UI label rather than placeholder text.
  const defaultLabel =
    defaults.text === "" ? "（プロバイダ既定指示）" : defaults.text;

  return (
    <article className="border border-hairline rounded-lg p-5">
      <header className="flex justify-between items-start gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-[2px]">
            <h3 className="text-md font-medium m-0">{descriptor.title}</h3>
            {current.isOverridden ? (
              <span className={BADGE_CLASS}>上書き中</span>
            ) : null}
          </div>
          <p className="text-xs text-ink-tertiary mt-[2px]">
            {descriptor.description}
          </p>
          {!current.isOverridden ? (
            <p className="text-xs text-ink-tertiary mt-1">
              既定値: {defaultLabel}
            </p>
          ) : null}
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
          placeholder={defaultLabel}
          onChange={(event) => setText(event.target.value)}
          disabled={isPending}
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
          className={BTN_GHOST_CLASS}
          onClick={onReset}
          disabled={isPending || !current.isOverridden}
        >
          この項目をリセット
        </button>
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
  promptDefaults,
}: {
  prompts: Readonly<Record<string, PromptDTO>>;
  promptDefaults: Readonly<Record<string, PromptDefaultDTO>>;
}) {
  const router = useRouter();
  const resetAll = useServerFn(resetAllPromptTemplatesFn);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const anyOverridden = Object.values(prompts).some((p) => p.isOverridden);

  const onConfirmReset = () => {
    startTransition(async () => {
      setError(null);
      try {
        await resetAll({ data: {} });
        await router.invalidate();
        setConfirmOpen(false);
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {PROMPT_DESCRIPTORS.map((descriptor) => {
          const current = prompts[descriptor.purpose];
          const defaults = promptDefaults[descriptor.purpose];
          if (current === undefined || defaults === undefined) return null;
          return (
            <PromptCard
              key={descriptor.purpose}
              descriptor={descriptor}
              current={current}
              defaults={defaults}
            />
          );
        })}
      </div>
      <div className="flex justify-end gap-3 items-center mt-8 pt-6 border-t border-hairline">
        {summary !== "" ? (
          <span className="text-error text-sm">{summary}</span>
        ) : null}
        <button
          type="button"
          className={BTN_DESTRUCTIVE_CLASS}
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || !anyOverridden}
        >
          すべてのプロンプトをリセット
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="すべてのプロンプトをリセットしますか？"
        description="すべての上書きが削除され、各プロンプトはプロバイダの既定指示に戻ります。この操作は取り消せません。"
        confirmLabel={isPending ? "リセット中..." : "リセット"}
        isPending={isPending}
        onConfirm={onConfirmReset}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
