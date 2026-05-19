"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import type { InstanceSettingsDTO } from "@/core/application/dto/adminSettings";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { testLLMConnectionFn, updateLLMConfigFn } from "./action";

type ConnectionResult = {
  ok: boolean;
  latencyMs: number;
  error: string | null;
};

type FormState = {
  error: SerializedError | null;
  success: boolean;
};

const initialState: FormState = { error: null, success: false };

const SECTION_CLASS = "py-8 border-b border-hairline last:border-b-0";
const SECTION_TITLE_CLASS = "text-xl font-semibold tracking-tight m-0 mb-2";
const SECTION_DESC_CLASS = "text-sm text-ink-secondary m-0 mb-5";
const FIELD_CLASS = "mb-4";
const FIELD_LABEL_CLASS = "block text-sm font-medium text-ink mb-[6px]";
const FIELD_HINT_CLASS = "text-xs text-ink-tertiary mt-1";
const FIELD_ERROR_CLASS = "text-xs text-error mt-1";
const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong";
const INPUT_MONO_CLASS = `${INPUT_CLASS} font-mono`;
const BTN_CLASS =
  "inline-flex items-center gap-[6px] h-9 px-4 rounded-pill bg-surface text-ink text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_PRIMARY_CLASS =
  "inline-flex items-center gap-[6px] h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed";
const FORM_FOOTER_CLASS =
  "flex gap-3 justify-end pt-6 border-t border-hairline mt-10";
const BANNER_BASE =
  "flex items-start gap-3 mb-6 px-5 py-4 rounded-lg text-sm text-ink";
const CODE_INLINE_CLASS =
  "font-mono text-xs px-[5px] py-[1px] bg-surface rounded-xs";

export function LLMSettingsForm({
  settings,
}: {
  settings: InstanceSettingsDTO;
}) {
  const router = useRouter();
  const updateLLMConfig = useServerFn(updateLLMConfigFn);
  const testLLMConnection = useServerFn(testLLMConnectionFn);

  const modelId = useId();
  const apiKeyId = useId();

  const [model, setModel] = useState(settings.llm.model);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);
  const [testError, setTestError] = useState<SerializedError | null>(null);
  const [isTesting, startTestTransition] = useTransition();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const nextModel = String(formData.get("model") ?? "").trim();
      const nextApiKey = String(formData.get("apiKey") ?? "");
      try {
        await updateLLMConfig({
          data: {
            model: nextModel,
            apiKeyPlain: nextApiKey.length > 0 ? nextApiKey : null,
          },
        });
        setApiKeyDraft("");
        await router.invalidate();
        return { error: null, success: true };
      } catch (error) {
        return { error: extractSerializedError(error), success: false };
      }
    },
    initialState,
  );

  const onTest = () => {
    startTestTransition(async () => {
      setTestError(null);
      try {
        const result = await testLLMConnection({
          data: { useDraft: false, draftConfig: null },
        });
        setTestResult(result);
      } catch (error) {
        setTestResult(null);
        setTestError(extractSerializedError(error));
      }
    });
  };

  const summaryMessage = state.error !== null ? displayError(state.error) : "";
  const testErrorMessage = testError !== null ? displayError(testError) : "";

  return (
    <form action={formAction}>
      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>プロバイダ</h2>
        <p className={SECTION_DESC_CLASS}>
          Hollow は MVP では Anthropic Claude のみをサポートします。
        </p>
        <div className="flex items-center gap-3 p-4 bg-surface rounded-md text-sm">
          <div>
            <div className="font-medium">Anthropic Claude</div>
            <div className="text-xs text-ink-tertiary">
              {settings.llm.provider}
            </div>
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>API キー</h2>
        <p className={SECTION_DESC_CLASS}>
          環境変数 <code className={CODE_INLINE_CLASS}>ANTHROPIC_API_KEY</code>{" "}
          が優先されます。未設定の場合は DB に暗号化保管された値が使用されます。
        </p>
        <div className={`${BANNER_BASE} bg-accent-surface`} role="status">
          <div className="flex-1 text-ink">
            <strong className="block mb-[2px] font-semibold">現在の状態</strong>
            {settings.llm.apiKeySource === "env"
              ? "環境変数から読み込み中"
              : settings.llm.apiKeyMasked !== null
                ? `DB に保管されたキーを使用中 (${settings.llm.apiKeyMasked})`
                : "API キーは未設定です"}
          </div>
        </div>
        <div className={FIELD_CLASS}>
          <label className={FIELD_LABEL_CLASS} htmlFor={apiKeyId}>
            新しい API キー
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={apiKeyId}
              name="apiKey"
              type="password"
              className={`${INPUT_MONO_CLASS} flex-1 min-w-0`}
              placeholder="sk-ant-..."
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
            <button
              type="button"
              className={BTN_CLASS}
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? "テスト中..." : "接続テスト"}
            </button>
          </div>
          <p className={FIELD_HINT_CLASS}>
            未入力で保存すると現在のキーが維持されます。
          </p>
          {testResult !== null ? (
            <div
              className={`${BANNER_BASE} mt-3 ${
                testResult.ok ? "bg-success-surface" : "bg-error-surface"
              }`}
              role="status"
            >
              <div className="flex-1 text-ink">
                {testResult.ok
                  ? `接続成功 · 応答 ${testResult.latencyMs}ms`
                  : `接続失敗 · ${testResult.error ?? "原因不明"}`}
              </div>
            </div>
          ) : null}
          {testErrorMessage !== "" ? (
            <p className={FIELD_ERROR_CLASS}>{testErrorMessage}</p>
          ) : null}
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>モデル</h2>
        <p className={SECTION_DESC_CLASS}>
          取り込み・タイトル生成・ディレクトリ提案で使用するモデル。
        </p>
        <div className={FIELD_CLASS}>
          <label className={FIELD_LABEL_CLASS} htmlFor={modelId}>
            既定モデル
          </label>
          <input
            id={modelId}
            name="model"
            type="text"
            className={INPUT_CLASS}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            disabled={isPending}
          />
          <p className={FIELD_HINT_CLASS}>例: claude-sonnet-4-6</p>
        </div>
      </section>

      <div className={FORM_FOOTER_CLASS}>
        {state.success && state.error === null ? (
          <span className="text-success text-sm">保存しました</span>
        ) : null}
        {summaryMessage !== "" ? (
          <span className="text-error text-sm">{summaryMessage}</span>
        ) : null}
        <button
          type="submit"
          className={BTN_PRIMARY_CLASS}
          disabled={isPending}
        >
          {isPending ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
