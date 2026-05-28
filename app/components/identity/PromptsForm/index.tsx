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
import { updateUserPromptFn } from "./action";

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
    <section>
      <h2>カスタムプロンプト</h2>
      <p>
        各用途のプロンプトを上書きできます。空のまま保存するとインスタンス
        デフォルトが適用されます。
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
        message: "プロンプト本文を入力してください",
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
    <article>
      <h3>{PURPOSE_LABEL[purpose]}</h3>
      <p>
        {inheriting
          ? "インスタンスデフォルトを使用中"
          : "個別オーバーライドが有効"}
      </p>
      <details>
        <summary>デフォルトプロンプト</summary>
        <pre>{defaultPrompt.text}</pre>
        <small>
          想定変数:{" "}
          {defaultPrompt.expectedVariables.length === 0
            ? "（なし）"
            : defaultPrompt.expectedVariables.join(", ")}
        </small>
      </details>
      <label htmlFor={textId}>あなたのプロンプト</label>
      <textarea
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        maxLength={10_000}
        disabled={isPending}
        placeholder={defaultPrompt.text}
      />
      <button type="button" onClick={save} disabled={isPending}>
        {isPending ? "保存中..." : "保存"}
      </button>
      {!inheriting ? (
        <button type="button" onClick={clear} disabled={isPending}>
          デフォルトに戻す
        </button>
      ) : null}
      {message !== "" ? <p role="alert">{message}</p> : null}
      {ok ? <p aria-live="polite">保存しました</p> : null}
    </article>
  );
}
