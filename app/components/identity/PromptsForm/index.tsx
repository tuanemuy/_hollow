"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { PromptDTO } from "@/core/application/dto/adminSettings";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FIELD,
  FIELD_ERROR,
  FIELD_LABEL,
  PROMPT_ACTION_ROW,
  PROMPT_BADGE,
  PROMPT_CARD,
  PROMPT_CARD_DESC,
  PROMPT_CARD_HEADER,
  PROMPT_CARD_NAME,
  PROMPT_DETAILS,
  PROMPT_META,
  PROMPT_PRE,
  PROMPT_SUMMARY,
  PROMPT_TEXTAREA,
  SECTION,
  SECTION_DESC,
  SECTION_TITLE,
  SUCCESS_MSG,
} from "../styles";
import { updateUserPromptFn } from "./action";

// Textarea placeholder prompting the user to write their own analysis intent.
// Keeps the personal-ownership nuance ("あなたの") that the user-facing screen
// carries, while conveying the same "empty = system default" model as admin.
const INTENT_PLACEHOLDER =
  "あなたの分析の意図を記入（空欄ならシステム既定の動作）";

const PURPOSES = [
  "structure",
  "title",
  "directory",
  "metadata",
  "ocr_assist",
] as const;
type Purpose = (typeof PURPOSES)[number];

const PURPOSE_LABEL: Readonly<Record<Purpose, string>> = {
  structure: "取り込み構造化",
  title: "タイトル生成",
  directory: "ディレクトリ提案",
  metadata: "メタデータ抽出",
  ocr_assist: "OCR 補正",
};

type Props = {
  defaults: Readonly<Record<string, PromptDTO>>;
  overrides: Readonly<Record<string, PromptDTO>>;
};

export function PromptsForm({ defaults, overrides }: Props) {
  return (
    <section className={SECTION}>
      <h2 className={SECTION_TITLE}>カスタムプロンプト</h2>
      <p className={SECTION_DESC}>
        各用途について、あなたの分析の意図を補足できます。空欄のままなら
        システム既定の動作が適用されます。
      </p>
      {PURPOSES.map((purpose) => {
        const baseline = defaults[purpose];
        const current = overrides[purpose];
        if (baseline === undefined) return null;
        return (
          <PromptRow
            key={purpose}
            purpose={purpose}
            defaultPrompt={baseline}
            override={current ?? null}
          />
        );
      })}
    </section>
  );
}

function PromptRow({
  purpose,
  defaultPrompt,
  override,
}: {
  purpose: Purpose;
  defaultPrompt: PromptDTO;
  override: PromptDTO | null;
}) {
  const router = useRouter();
  const update = useServerFn(updateUserPromptFn);
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(override?.text ?? "");
  const [error, setError] = useState<SerializedError | null>(null);
  const [ok, setOk] = useState(false);

  const textId = useId();

  const save = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError({
        kind: "validation",
        code: "INVALID_INPUT",
        message:
          "分析の指示を入力してください（空にする場合は「デフォルトに戻す」を使用）",
      });
      return;
    }
    startTransition(async () => {
      try {
        await update({
          data: {
            purpose,
            template: {
              text: trimmed,
              expectedVariables: defaultPrompt.expectedVariables,
            },
          },
        });
        await routerInvalidate(router);
        setError(null);
        setOk(true);
      } catch (e) {
        setError(extractSerializedError(e));
        setOk(false);
      }
    });
  };

  const clear = () => {
    startTransition(async () => {
      try {
        await update({ data: { purpose, template: null } });
        await routerInvalidate(router);
        setText("");
        setError(null);
        setOk(true);
      } catch (e) {
        setError(extractSerializedError(e));
        setOk(false);
      }
    });
  };

  const message = error === null ? "" : displayError(error);
  const inheriting = override === null;

  return (
    <article className={PROMPT_CARD}>
      <div className={PROMPT_CARD_HEADER}>
        <h3 className={PROMPT_CARD_NAME}>
          {PURPOSE_LABEL[purpose]}
          {!inheriting ? (
            <span className={PROMPT_BADGE}>カスタム適用中</span>
          ) : null}
        </h3>
      </div>
      <p className={PROMPT_CARD_DESC}>
        {inheriting
          ? "インスタンスデフォルトを使用中"
          : "個別オーバーライドが有効"}
      </p>
      <details className={PROMPT_DETAILS}>
        <summary className={PROMPT_SUMMARY}>デフォルトプロンプト</summary>
        <pre className={PROMPT_PRE}>{defaultPrompt.text}</pre>
        <small className={PROMPT_META}>
          想定変数:{" "}
          {defaultPrompt.expectedVariables.length === 0
            ? "（なし）"
            : defaultPrompt.expectedVariables.join(", ")}
        </small>
      </details>
      <div className={FIELD}>
        <label htmlFor={textId} className={FIELD_LABEL}>
          あなたの分析の指示（任意）
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={10_000}
          disabled={isPending}
          placeholder={INTENT_PLACEHOLDER}
          className={PROMPT_TEXTAREA}
        />
      </div>
      <div className={PROMPT_ACTION_ROW}>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className={BTN_PRIMARY}
          data-primary=""
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        {!inheriting ? (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            className={BTN_SECONDARY}
          >
            デフォルトに戻す
          </button>
        ) : null}
      </div>
      {message !== "" ? (
        <p role="alert" className={FIELD_ERROR}>
          {message}
        </p>
      ) : null}
      {ok ? (
        <p aria-live="polite" className={SUCCESS_MSG}>
          保存しました
        </p>
      ) : null}
    </article>
  );
}
