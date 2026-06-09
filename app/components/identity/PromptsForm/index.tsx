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
  PREVIEW_ARROW,
  PREVIEW_BLOCK,
  PREVIEW_BLOCK_BODY,
  PREVIEW_BLOCK_LABEL,
  PREVIEW_PAIR,
  PREVIEW_PANEL,
  PREVIEW_PANEL_HEAD,
  PREVIEW_PANEL_NOTE,
  PREVIEW_PANEL_TITLE,
  PREVIEW_SAMPLE_TEXTAREA,
  PREVIEW_UNAVAILABLE,
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
import { previewPromptFn, updateUserPromptFn } from "./action";
import { SAMPLE_TEXT_MAX_LENGTH } from "./schema";

// Preview-capable purposes share the LLM execution path; `ocr_assist`
// does not (no LLMProvider method — Issue #574 ADR-001). This narrows the
// 5-purpose save-side enum to the 4-purpose preview enum in one place.
type PreviewPurpose = "structure" | "title" | "directory" | "metadata";
const PREVIEW_PURPOSES = new Set<Purpose>([
  "structure",
  "title",
  "directory",
  "metadata",
]);
function isPreviewable(purpose: Purpose): purpose is PreviewPurpose {
  return PREVIEW_PURPOSES.has(purpose);
}

// Mirror of the usecase output projection (PreviewPromptOutput) kept local
// so the client component does not import application-layer types.
type PreviewResult =
  | {
      kind: "structure";
      html: string;
      titleSuggestion: string;
      directorySuggestion: string | null;
    }
  | { kind: "metadata"; tags: readonly string[]; aliases: readonly string[] };

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
      {isPreviewable(purpose) ? (
        <PreviewPanel purpose={purpose} editingText={text} />
      ) : (
        <div className={PREVIEW_PANEL}>
          <div className={PREVIEW_PANEL_HEAD}>
            <span className={PREVIEW_PANEL_TITLE}>プレビュー</span>
          </div>
          <p className={PREVIEW_UNAVAILABLE}>
            この用途はプレビューに対応していません。
          </p>
        </div>
      )}
    </article>
  );
}

// Sample-input copy per purpose. metadata takes structured HTML (not raw
// text); structure/title/directory take raw text and trigger a full
// structuring pass (ADR-002).
const PREVIEW_INPUT_LABEL: Readonly<Record<PreviewPurpose, string>> = {
  structure: "入力サンプル（生テキスト）",
  title: "入力サンプル（生テキスト）",
  directory: "入力サンプル（生テキスト）",
  metadata: "入力サンプル（構造化済み HTML）",
};

const PREVIEW_OUTPUT_LABEL: Readonly<Record<PreviewPurpose, string>> = {
  structure: "構造化 HTML",
  title: "タイトル提案",
  directory: "ディレクトリ提案",
  metadata: "メタデータ（タグ / 別名）",
};

const PREVIEW_NOTE: Readonly<Record<PreviewPurpose, string>> = {
  structure: "サンプルテキストを実 AI で構造化します。",
  title: "構造化を伴うプレビューです（実 AI を呼び出します）。",
  directory:
    "構造化を伴うプレビューです。既存ディレクトリとの照合はしない簡易プレビューのため、常に新規ディレクトリ名として提案されます。",
  metadata: "構造化済み HTML から実 AI でメタデータを抽出します。",
};

function PreviewPanel({
  purpose,
  editingText,
}: {
  purpose: PreviewPurpose;
  editingText: string;
}) {
  const run = useServerFn(previewPromptFn);
  const [isPending, startTransition] = useTransition();
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<SerializedError | null>(null);
  const sampleId = useId();

  const execute = () => {
    const trimmed = sample.trim();
    if (trimmed.length === 0) {
      setError({
        kind: "validation",
        code: "INVALID_INPUT",
        message: "サンプルを入力してください",
      });
      return;
    }
    const editing = editingText.trim();
    startTransition(async () => {
      try {
        const output = await run({
          data: {
            purpose,
            sampleText: trimmed,
            ...(editing.length > 0 ? { overridePrompt: editing } : {}),
          },
        });
        setResult(output as PreviewResult);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
        setResult(null);
      }
    });
  };

  const message = error === null ? "" : displayError(error);

  return (
    <div className={PREVIEW_PANEL}>
      <div className={PREVIEW_PANEL_HEAD}>
        <span className={PREVIEW_PANEL_TITLE}>プレビュー</span>
      </div>
      <p className={PREVIEW_PANEL_NOTE}>{PREVIEW_NOTE[purpose]}</p>
      <div className={FIELD}>
        <label htmlFor={sampleId} className={FIELD_LABEL}>
          {PREVIEW_INPUT_LABEL[purpose]}
        </label>
        <textarea
          id={sampleId}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          rows={4}
          maxLength={SAMPLE_TEXT_MAX_LENGTH}
          disabled={isPending}
          className={PREVIEW_SAMPLE_TEXTAREA}
        />
      </div>
      <div className={PROMPT_ACTION_ROW}>
        <button
          type="button"
          onClick={execute}
          disabled={isPending}
          className={BTN_SECONDARY}
        >
          {isPending ? "実行中..." : "サンプルで実行"}
        </button>
      </div>
      {message !== "" ? (
        <p role="alert" className={FIELD_ERROR}>
          {message}
        </p>
      ) : null}
      {result !== null ? (
        <div className={PREVIEW_PAIR}>
          <div className={PREVIEW_BLOCK}>
            <div className={PREVIEW_BLOCK_LABEL}>入力</div>
            <div className={PREVIEW_BLOCK_BODY}>{sample}</div>
          </div>
          <div className={PREVIEW_ARROW} aria-hidden="true">
            →
          </div>
          <div className={PREVIEW_BLOCK}>
            <div className={PREVIEW_BLOCK_LABEL}>
              {PREVIEW_OUTPUT_LABEL[purpose]}
            </div>
            <div className={PREVIEW_BLOCK_BODY}>
              {renderOutput(purpose, result)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderOutput(purpose: PreviewPurpose, result: PreviewResult): string {
  if (result.kind === "metadata") {
    const tags =
      result.tags.length > 0 ? result.tags.join(", ") : "（タグなし）";
    const aliases =
      result.aliases.length > 0 ? result.aliases.join(", ") : "（別名なし）";
    return `タグ: ${tags}\n別名: ${aliases}`;
  }
  switch (purpose) {
    case "structure":
      return result.html;
    case "title":
      return result.titleSuggestion;
    case "directory":
      return result.directorySuggestion ?? "（提案なし）";
    default:
      return "";
  }
}
