"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import type { InstanceSettingsDTO } from "@/core/application/dto/adminSettings";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { LLM_PROVIDERS_TRANSPORT } from "../schema";
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

type ProviderId = (typeof LLM_PROVIDERS_TRANSPORT)[number];

const initialState: FormState = { error: null, success: false };

const PROVIDER_LABEL: Readonly<Record<ProviderId, string>> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI-compatible",
  gemini: "Google Gemini",
};

const SECTION_CLASS = "py-8 border-b border-hairline last:border-b-0";
const SECTION_TITLE_CLASS = "text-xl font-semibold tracking-tight m-0 mb-2";
const SECTION_DESC_CLASS = "text-sm text-ink-secondary m-0 mb-5";
const FIELD_CLASS = "mb-4";
const FIELD_LABEL_CLASS =
  "flex items-center gap-2 text-sm font-medium text-ink mb-[6px]";
const FIELD_HINT_CLASS = "text-xs text-ink-tertiary mt-1";
const FIELD_ERROR_CLASS = "text-xs text-error mt-1";
const INPUT_CLASS =
  "w-full h-10 px-3 bg-surface border border-transparent rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus:bg-bg focus:border-hairline-strong disabled:opacity-disabled disabled:cursor-not-allowed disabled:bg-surface";
const INPUT_MONO_CLASS = `${INPUT_CLASS} font-mono`;
const SELECT_CLASS = INPUT_CLASS;
const FORM_FOOTER_CLASS =
  "flex gap-3 justify-end pt-6 border-t border-hairline mt-10";
const BANNER_BASE =
  "flex items-start gap-3 mb-6 px-5 py-4 rounded-lg text-sm text-ink";
const CODE_INLINE_CLASS =
  "font-mono text-xs px-[5px] py-[1px] bg-surface rounded-xs";
const REQUIRED_BADGE_CLASS =
  "inline-flex items-center h-5 px-2 rounded-pill bg-error-surface text-error text-[11px] font-semibold";
const LOCK_BADGE_CLASS =
  "inline-flex items-center h-5 px-2 rounded-pill bg-surface text-ink-secondary text-[11px] font-semibold";
const LOCK_HINT_CLASS = "text-xs text-ink-tertiary mt-1";

function isProviderId(value: string): value is ProviderId {
  return (LLM_PROVIDERS_TRANSPORT as readonly string[]).includes(value);
}

export function LLMSettingsForm({
  settings,
}: {
  settings: InstanceSettingsDTO;
}) {
  const router = useRouter();
  const updateLLMConfig = useServerFn(updateLLMConfigFn);
  const testLLMConnection = useServerFn(testLLMConnectionFn);

  const providerId = useId();
  const modelId = useId();
  const baseURLId = useId();
  const apiKeyId = useId();
  const providerLockHintId = useId();
  const modelLockHintId = useId();
  const baseURLLockHintId = useId();
  const apiKeyLockHintId = useId();

  // Defensive narrowing: the DTO's `provider` is typed as `string` and
  // could drift away from `LLM_PROVIDERS_TRANSPORT` if the domain adds a
  // provider before the transport list is updated (or vice versa). Fall
  // back to the first transport literal so the UI keeps rendering rather
  // than blowing up on a missing label / select option.
  const persistedProvider: ProviderId = isProviderId(settings.llm.provider)
    ? settings.llm.provider
    : LLM_PROVIDERS_TRANSPORT[0];
  const [provider, setProvider] = useState<ProviderId>(persistedProvider);
  const [model, setModel] = useState(settings.llm.model);
  const [baseURL, setBaseURL] = useState(settings.llm.baseURL ?? "");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);
  const [testError, setTestError] = useState<SerializedError | null>(null);
  const [isTesting, startTestTransition] = useTransition();

  const envOverrides = settings.llm.envOverrides;
  // env-locked fields: HTML `disabled` removes them from the submitted
  // FormData per spec, so the usecase silent-skip is a defensive net
  // rather than the primary mechanism (Issue #143 ADR-006).
  const allLocked =
    envOverrides.provider &&
    envOverrides.model &&
    envOverrides.apiKey &&
    envOverrides.baseURL;
  // env-pinned provider cannot be changed by the operator. Without this
  // suppression the local `provider` state would diverge from
  // `persistedProvider` whenever the user toggles a still-mounted select
  // option, and `providerChanged` would falsely demand an api key.
  const providerChanged =
    !envOverrides.provider && provider !== persistedProvider;
  const apiKeyRequired = providerChanged && !envOverrides.apiKey;
  // Render the baseURL field when the provider is openai (semantics: only
  // openai consumes a base URL) OR when env has set a baseURL (so the lock
  // UI surfaces even with `ADMIN_LLM_PROVIDER=anthropic + ADMIN_LLM_BASE_URL=...`).
  const showBaseURL = provider === "openai" || envOverrides.baseURL;

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const nextProviderRaw = String(formData.get("provider") ?? "");
      const nextProvider = isProviderId(nextProviderRaw)
        ? nextProviderRaw
        : persistedProvider;
      const nextModel = String(formData.get("model") ?? "").trim();
      const nextBaseURLRaw = String(formData.get("baseURL") ?? "");
      const nextBaseURL =
        nextProvider === "openai" && nextBaseURLRaw.trim().length > 0
          ? nextBaseURLRaw
          : null;
      const nextApiKey = String(formData.get("apiKey") ?? "");
      try {
        await updateLLMConfig({
          data: {
            provider: nextProvider,
            model: nextModel,
            baseURL: nextBaseURL,
            apiKeyPlain: nextApiKey.length > 0 ? nextApiKey : null,
          },
        });
        setApiKeyDraft("");
        await routerInvalidate(router);
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
        // Draft test previews the form's pending provider / model / baseURL
        // against the env-provided api key. Per the locked transport
        // schema, the draft cannot carry the form's typed-in plain api
        // key (ciphertext never leaves the adapter boundary), so the
        // draft hardcodes `apiKeySource: "env"` and relies on the
        // operator having `ADMIN_LLM_API_KEY` set during preview.
        const draftBaseURL =
          provider === "openai" && baseURL.trim().length > 0
            ? baseURL.trim()
            : null;
        const result = await testLLMConnection({
          data: {
            useDraft: true,
            draftConfig: {
              provider,
              model,
              baseURL: draftBaseURL,
              apiKeySource: "env",
              apiKeyCiphertext: null,
            },
          },
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
  // Field-level mapping for the "provider changed but no api key supplied"
  // server-side rejection. The transport returns a `business`-kind error
  // with this code; surfacing it on the api-key input lets assistive tech
  // jump straight to the offending field instead of hunting the summary
  // for context.
  const apiKeyServerError =
    state.error !== null &&
    state.error.kind === "business" &&
    state.error.code === "admin_settings_provider_changed_requires_api_key"
      ? "プロバイダ変更には新しい API キーが必要です。"
      : null;

  return (
    <form action={formAction}>
      {allLocked ? (
        <div
          className={`${BANNER_BASE} bg-accent-surface`}
          role="status"
          data-all-env-locked=""
        >
          <div className="flex-1 text-ink">
            <strong className="block mb-[2px] font-semibold">
              すべての LLM 設定が環境変数で固定中
            </strong>
            プロバイダ・モデル・Base URL・API
            キーのすべてが環境変数で設定されています。
            このページからの変更は反映されません。設定を変更するには
            <code className={CODE_INLINE_CLASS}>ADMIN_LLM_*</code>{" "}
            環境変数を更新してください。
          </div>
        </div>
      ) : null}
      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>LLM プロバイダ</h2>
        <p className={SECTION_DESC_CLASS}>
          対応プロバイダ: Anthropic / OpenAI-compatible / Google Gemini。
          切り替えると API キーの再入力が必要です。
        </p>
        <div className={FIELD_CLASS}>
          <label className={FIELD_LABEL_CLASS} htmlFor={providerId}>
            プロバイダ
            {envOverrides.provider ? (
              <span className={LOCK_BADGE_CLASS} aria-hidden="true">
                環境変数で固定中
              </span>
            ) : null}
          </label>
          <select
            id={providerId}
            name="provider"
            className={SELECT_CLASS}
            value={provider}
            onChange={(event) => {
              const next = event.target.value;
              if (isProviderId(next)) {
                setProvider(next);
              }
            }}
            disabled={isPending || envOverrides.provider}
            data-env-locked={envOverrides.provider || undefined}
            aria-describedby={
              envOverrides.provider ? providerLockHintId : undefined
            }
          >
            {LLM_PROVIDERS_TRANSPORT.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_LABEL[id]}
              </option>
            ))}
          </select>
          <p className={FIELD_HINT_CLASS}>
            現在の保存値: {PROVIDER_LABEL[persistedProvider]}
          </p>
          {envOverrides.provider ? (
            <p className={LOCK_HINT_CLASS} id={providerLockHintId}>
              環境変数{" "}
              <code className={CODE_INLINE_CLASS}>ADMIN_LLM_PROVIDER</code>{" "}
              で固定されているため変更できません。
            </p>
          ) : null}
        </div>
        {providerChanged ? (
          <div
            className={`${BANNER_BASE} bg-warning-surface text-warning`}
            role="alert"
            data-provider-changed=""
          >
            <div className="flex-1">
              <strong className="block mb-[2px] font-semibold">
                プロバイダの変更
              </strong>
              プロバイダを変更すると API キーの再入力が必要です。 下の「新しい
              API キー」欄に新しい鍵を入力してください。
            </div>
          </div>
        ) : null}
        {showBaseURL ? (
          <div className={FIELD_CLASS}>
            <label className={FIELD_LABEL_CLASS} htmlFor={baseURLId}>
              Base URL（任意）
              {envOverrides.baseURL ? (
                <span className={LOCK_BADGE_CLASS} aria-hidden="true">
                  環境変数で固定中
                </span>
              ) : null}
            </label>
            <input
              id={baseURLId}
              name="baseURL"
              type="url"
              maxLength={500}
              className={INPUT_MONO_CLASS}
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={isPending || envOverrides.baseURL}
              data-env-locked={envOverrides.baseURL || undefined}
              autoComplete="off"
              aria-describedby={
                envOverrides.baseURL ? baseURLLockHintId : undefined
              }
            />
            <p className={FIELD_HINT_CLASS}>
              OpenAI 本家を使う場合は空欄で OK。Azure / Groq / vLLM 等の場合は
              base URL（
              <code className={CODE_INLINE_CLASS}>/chat/completions</code>{" "}
              を含まないパスまで）を入力。Azure は{" "}
              <code className={CODE_INLINE_CLASS}>?api-version=...</code>{" "}
              を含めて保存してください。
            </p>
            <p className={FIELD_HINT_CLASS}>
              PDF 取り込みには <code className={CODE_INLINE_CLASS}>gpt-4o</code>{" "}
              系のモデル指定が必要です。
            </p>
            {envOverrides.baseURL ? (
              <p className={LOCK_HINT_CLASS} id={baseURLLockHintId}>
                環境変数{" "}
                <code className={CODE_INLINE_CLASS}>ADMIN_LLM_BASE_URL</code>{" "}
                で固定されているため変更できません。
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>API キー</h2>
        <p className={SECTION_DESC_CLASS}>
          環境変数 <code className={CODE_INLINE_CLASS}>ADMIN_LLM_API_KEY</code>{" "}
          が優先されます。未設定の場合は DB に暗号化保管された値が使用されます。
        </p>
        {!providerChanged ? (
          // Hide the persisted-state announcement while the provider-change
          // alert above is live — otherwise screen readers announce two
          // competing aria-live regions on the same render and the
          // user-actionable warning loses priority.
          <div className={`${BANNER_BASE} bg-accent-surface`} role="status">
            <div className="flex-1 text-ink">
              <strong className="block mb-[2px] font-semibold">
                現在の状態
              </strong>
              {settings.llm.apiKeySource === "env"
                ? "環境変数から読み込み中"
                : settings.llm.apiKeyMasked !== null
                  ? `DB に保管されたキーを使用中 (${settings.llm.apiKeyMasked})`
                  : "API キーは未設定です"}
            </div>
          </div>
        ) : null}
        <div className={FIELD_CLASS}>
          <label className={FIELD_LABEL_CLASS} htmlFor={apiKeyId}>
            新しい API キー
            {apiKeyRequired ? (
              <span className={REQUIRED_BADGE_CLASS} aria-hidden="true">
                必須
              </span>
            ) : null}
            {envOverrides.apiKey ? (
              <span className={LOCK_BADGE_CLASS} aria-hidden="true">
                環境変数で固定中
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={apiKeyId}
              name="apiKey"
              type="password"
              className={`${INPUT_MONO_CLASS} flex-1 min-w-0`}
              placeholder={
                provider === "anthropic"
                  ? "sk-ant-..."
                  : provider === "openai"
                    ? "sk-..."
                    : "AIza..."
              }
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              autoComplete="off"
              disabled={isPending || envOverrides.apiKey}
              data-env-locked={envOverrides.apiKey || undefined}
              required={apiKeyRequired || undefined}
              aria-invalid={apiKeyServerError !== null || undefined}
              aria-describedby={
                envOverrides.apiKey ? apiKeyLockHintId : undefined
              }
            />
            <button
              type="button"
              className={pillBtn}
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? "テスト中..." : "接続テスト"}
            </button>
          </div>
          <p
            className={FIELD_HINT_CLASS}
            id={envOverrides.apiKey ? apiKeyLockHintId : undefined}
          >
            {envOverrides.apiKey
              ? "環境変数 ADMIN_LLM_API_KEY で固定されているため変更できません。"
              : apiKeyRequired
                ? "プロバイダを変更したため、新しい API キーの入力が必要です。"
                : "未入力で保存すると現在のキーが維持されます。"}
          </p>
          {apiKeyServerError !== null ? (
            <p className={FIELD_ERROR_CLASS}>{apiKeyServerError}</p>
          ) : null}
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
            {envOverrides.model ? (
              <span className={LOCK_BADGE_CLASS} aria-hidden="true">
                環境変数で固定中
              </span>
            ) : null}
          </label>
          <input
            id={modelId}
            name="model"
            type="text"
            className={INPUT_CLASS}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required={!envOverrides.model || undefined}
            disabled={isPending || envOverrides.model}
            data-env-locked={envOverrides.model || undefined}
            aria-describedby={envOverrides.model ? modelLockHintId : undefined}
          />
          <p className={FIELD_HINT_CLASS}>
            例:{" "}
            {provider === "anthropic"
              ? "claude-sonnet-4-6"
              : provider === "openai"
                ? "gpt-4o"
                : "gemini-1.5-pro"}
          </p>
          {envOverrides.model ? (
            <p className={LOCK_HINT_CLASS} id={modelLockHintId}>
              環境変数{" "}
              <code className={CODE_INLINE_CLASS}>ADMIN_LLM_MODEL</code>{" "}
              で固定されているため変更できません。
            </p>
          ) : null}
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
          className={`${pillBtn} ${pillBtnPrimary}`}
          data-primary=""
          disabled={isPending || allLocked}
          data-all-env-locked={allLocked || undefined}
        >
          {isPending ? "保存中..." : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
