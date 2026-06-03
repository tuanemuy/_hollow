"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  pillBtn,
  pillBtnGhostDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import type {
  PromptDefaultDTO,
  PromptDTO,
} from "@/core/application/dto/adminSettings";
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
    description: "本文をどう構造化・整形してほしいかの意図を補足できます",
  },
  {
    purpose: "title",
    title: "タイトル生成プロンプト",
    description: "どんな観点でタイトルを付けてほしいかの意図を補足できます",
  },
  {
    purpose: "directory",
    title: "ディレクトリ提案プロンプト",
    description: "どんな基準で配置先を提案してほしいかの意図を補足できます",
  },
  {
    purpose: "metadata",
    title: "メタデータ抽出プロンプト",
    description: "どんな粒度でタグ付けしてほしいかの意図を補足できます",
  },
  {
    purpose: "ocr_assist",
    title: "OCR 補助プロンプト",
    description:
      "OCR 結果の補正・整形の意図を補足できます（OCR 機能は今後の実装で利用予定）",
  },
];

// Shown as the resolved default value when no override is in place — the
// empty system default means "operator added no extra instruction" (#396).
const NO_OVERRIDE_LABEL = "（追加の指示なし）";
// Textarea placeholder prompting the operator to write their analysis intent.
const INTENT_PLACEHOLDER =
  "どう分析してほしいかの意図を記入（空欄ならシステム既定の動作）";

const FIELD_LABEL_CLASS = "block text-sm font-medium text-ink mb-[6px]";
const FIELD_HINT_CLASS = "text-xs text-ink-tertiary mt-1";
const FIELD_ERROR_CLASS = "text-xs text-error mt-1";
const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const INPUT_MONO_CLASS = `${INPUT_CLASS} font-mono`;
const TEXTAREA_CLASS =
  "w-full min-h-[140px] px-3 py-[10px] bg-surface border border-transparent rounded-md font-mono text-xs text-ink leading-relaxed outline-none resize-y transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
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
  // visually that "no override = system default behaviour only" is in effect.
  const [text, setText] = useState(current.isOverridden ? current.text : "");
  const [variables, setVariables] = useState(
    (current.isOverridden ? current.expectedVariables : []).join(", "),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "saved" | "reset";
    at: number;
  } | null>(null);

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
        await routerInvalidate(router);
        setFeedback({ kind: "saved", at: Date.now() });
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
        await routerInvalidate(router);
        setFeedback({ kind: "reset", at: Date.now() });
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const fieldErrors =
    error?.kind === "validation" ? error.fieldErrors : undefined;
  const summary = error !== null ? displayError(error) : "";

  // ADR-002: the empty system default ("no additional operator intent") is
  // surfaced to operators through this UI label rather than placeholder text.
  const defaultLabel = defaults.text === "" ? NO_OVERRIDE_LABEL : defaults.text;

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
          分析の指示（任意）
        </label>
        <textarea
          id={textId}
          className={TEXTAREA_CLASS}
          value={text}
          spellCheck={false}
          placeholder={INTENT_PLACEHOLDER}
          onChange={(event) => setText(event.target.value)}
          disabled={isPending}
        />
        {current.isOverridden && text.trim().length === 0 ? (
          <p className={FIELD_HINT_CLASS}>
            空にしたい場合は「この項目をリセット」を使ってください。
          </p>
        ) : null}
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
        {feedback !== null && error === null ? (
          <span className="text-success text-xs">
            {feedback.kind === "saved" ? "保存しました" : "リセットしました"}
          </span>
        ) : null}
        {summary !== "" && fieldErrors === undefined ? (
          <span className="text-error text-xs">{summary}</span>
        ) : null}
        <button
          type="button"
          className={`${pillBtn} ${pillBtnGhostDanger}`}
          data-ghost-danger=""
          onClick={onReset}
          disabled={isPending || !current.isOverridden}
        >
          この項目をリセット
        </button>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnPrimary}`}
          data-primary=""
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
        await routerInvalidate(router);
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
          className={`${pillBtn} ${pillBtnGhostDanger}`}
          data-ghost-danger=""
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || !anyOverridden}
        >
          すべてのプロンプトをリセット
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="すべてのプロンプトをリセットしますか？"
        description="すべての上書きが削除され、各プロンプトはシステム既定の動作に戻ります。この操作は取り消せません。"
        confirmLabel={isPending ? "リセット中..." : "リセット"}
        confirmIcon={RotateCcw}
        isPending={isPending}
        onConfirm={onConfirmReset}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
