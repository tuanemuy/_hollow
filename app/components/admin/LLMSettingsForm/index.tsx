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
      <section className="admin-form-section">
        <h2 className="admin-form-section-title">プロバイダ</h2>
        <p className="admin-form-section-desc">
          Hollow は MVP では Anthropic Claude のみをサポートします。
        </p>
        <div className="admin-locked-display">
          <div>
            <div className="name">Anthropic Claude</div>
            <div className="sub">{settings.llm.provider}</div>
          </div>
        </div>
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section-title">API キー</h2>
        <p className="admin-form-section-desc">
          環境変数 <code className="admin-code">ANTHROPIC_API_KEY</code>{" "}
          が優先されます。未設定の場合は DB に暗号化保管された値が使用されます。
        </p>
        <div className="admin-banner info" role="status">
          <div className="admin-banner-body">
            <strong>現在の状態</strong>
            {settings.llm.apiKeySource === "env"
              ? "環境変数から読み込み中"
              : settings.llm.apiKeyMasked !== null
                ? `DB に保管されたキーを使用中 (${settings.llm.apiKeyMasked})`
                : "API キーは未設定です"}
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-field-label" htmlFor={apiKeyId}>
            新しい API キー
          </label>
          <div className="admin-input-row">
            <input
              id={apiKeyId}
              name="apiKey"
              type="password"
              className="admin-input mono"
              placeholder="sk-ant-..."
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
            <button
              type="button"
              className="admin-btn"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? "テスト中..." : "接続テスト"}
            </button>
          </div>
          <p className="admin-field-hint">
            未入力で保存すると現在のキーが維持されます。
          </p>
          {testResult !== null ? (
            <div
              className={`admin-banner ${testResult.ok ? "success" : "error"}`}
              role="status"
              style={{ marginTop: "var(--admin-space-3)" }}
            >
              <div className="admin-banner-body">
                {testResult.ok
                  ? `接続成功 · 応答 ${testResult.latencyMs}ms`
                  : `接続失敗 · ${testResult.error ?? "原因不明"}`}
              </div>
            </div>
          ) : null}
          {testErrorMessage !== "" ? (
            <p className="admin-field-error">{testErrorMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="admin-form-section">
        <h2 className="admin-form-section-title">モデル</h2>
        <p className="admin-form-section-desc">
          取り込み・タイトル生成・ディレクトリ提案で使用するモデル。
        </p>
        <div className="admin-field">
          <label className="admin-field-label" htmlFor={modelId}>
            既定モデル
          </label>
          <input
            id={modelId}
            name="model"
            type="text"
            className="admin-input"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            disabled={isPending}
          />
          <p className="admin-field-hint">例: claude-sonnet-4-6</p>
        </div>
      </section>

      <div className="admin-form-footer">
        {state.success && state.error === null ? (
          <span style={{ color: "var(--admin-color-success)" }}>
            保存しました
          </span>
        ) : null}
        {summaryMessage !== "" ? (
          <span style={{ color: "var(--admin-color-error)" }}>
            {summaryMessage}
          </span>
        ) : null}
        <button
          type="submit"
          className="admin-btn primary"
          disabled={isPending}
        >
          {isPending ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
