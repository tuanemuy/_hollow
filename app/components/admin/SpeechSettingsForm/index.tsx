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
import { SPEECH_PROVIDERS_TRANSPORT } from "../schema";
import { testSpeechConnectionFn, updateSpeechConfigFn } from "./action";

type ConnectionResult = {
  ok: boolean;
  latencyMs: number;
  error: string | null;
};

type FormState = {
  error: SerializedError | null;
  success: boolean;
};

type ProviderId = (typeof SPEECH_PROVIDERS_TRANSPORT)[number];

const initialState: FormState = { error: null, success: false };

const PROVIDER_LABEL: Readonly<Record<ProviderId, string>> = {
  openai: "OpenAI",
  deepgram: "Deepgram",
};

// Canonical default transcription model per provider. Mirrors the
// default-model mapping INVARIANT in
// `app/core/domain/adminSettings/valueObject.ts`. Used to reset the model
// field when the operator switches providers so a stale model (e.g.
// `gpt-4o-transcribe` carried into Deepgram) does not break the connection
// test / real transcribe.
const PROVIDER_DEFAULT_MODEL: Readonly<Record<ProviderId, string>> = {
  openai: "gpt-4o-transcribe",
  deepgram: "nova-3",
};

// API-key input placeholder per provider (OpenAI Bearer `sk-...` vs Deepgram
// `Token` keys). Same provider-branch pattern as the LLM form.
const PROVIDER_API_KEY_PLACEHOLDER: Readonly<Record<ProviderId, string>> = {
  openai: "sk-...",
  deepgram: "Token ...",
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
  return (SPEECH_PROVIDERS_TRANSPORT as readonly string[]).includes(value);
}

export function SpeechSettingsForm({
  settings,
}: {
  settings: InstanceSettingsDTO;
}) {
  const router = useRouter();
  const updateSpeechConfig = useServerFn(updateSpeechConfigFn);
  const testSpeechConnection = useServerFn(testSpeechConnectionFn);

  const providerId = useId();
  const modelId = useId();
  const apiKeyId = useId();
  const providerLockHintId = useId();
  const modelLockHintId = useId();
  const apiKeyLockHintId = useId();

  // Defensive narrowing: the DTO's `provider` is typed by the domain and
  // could drift away from `SPEECH_PROVIDERS_TRANSPORT` if the domain adds a
  // provider before the transport list is updated (or vice versa). Fall
  // back to the first transport literal so the UI keeps rendering rather
  // than blowing up on a missing label / select option.
  const persistedProvider: ProviderId = isProviderId(settings.speech.provider)
    ? settings.speech.provider
    : SPEECH_PROVIDERS_TRANSPORT[0];
  const [provider, setProvider] = useState<ProviderId>(persistedProvider);
  const [model, setModel] = useState(settings.speech.model);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);
  const [testError, setTestError] = useState<SerializedError | null>(null);
  const [isTesting, startTestTransition] = useTransition();

  const envOverrides = settings.speech.envOverrides;
  // env-locked fields: HTML `disabled` removes them from the submitted
  // FormData, so the usecase silent-skip is a defensive net rather than the
  // primary mechanism.
  const allLocked =
    envOverrides.provider && envOverrides.model && envOverrides.apiKey;
  // env-pinned provider cannot be changed by the operator. Without this
  // suppression the local `provider` state would diverge from
  // `persistedProvider` whenever the user toggles a still-mounted select
  // option, and `providerChanged` would falsely demand an api key.
  const providerChanged =
    !envOverrides.provider && provider !== persistedProvider;
  const apiKeyRequired = providerChanged && !envOverrides.apiKey;

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const nextProviderRaw = String(formData.get("provider") ?? "");
      const nextProvider = isProviderId(nextProviderRaw)
        ? nextProviderRaw
        : persistedProvider;
      const nextModel = String(formData.get("model") ?? "").trim();
      const nextApiKey = String(formData.get("apiKey") ?? "");
      try {
        await updateSpeechConfig({
          data: {
            provider: nextProvider,
            model: nextModel,
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
        // Draft test previews the form's pending provider / model against
        // the env-provided api key. Per the locked transport schema, the
        // draft cannot carry the form's typed-in plain api key (ciphertext
        // never leaves the adapter boundary), so the draft hardcodes
        // `apiKeySource: "env"` and relies on the operator having
        // `ADMIN_SPEECH_API_KEY` set during preview.
        const result = await testSpeechConnection({
          data: {
            useDraft: true,
            draftConfig: {
              provider,
              model,
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
    state.error.code ===
      "admin_settings_speech_provider_changed_requires_api_key"
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
              すべての文字起こし設定が環境変数で固定中
            </strong>
            プロバイダ・モデル・API キーのすべてが環境変数で設定されています。
            このページからの変更は反映されません。設定を変更するには
            <code className={CODE_INLINE_CLASS}>ADMIN_SPEECH_*</code>{" "}
            環境変数を更新してください。
          </div>
        </div>
      ) : null}
      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>文字起こしプロバイダ</h2>
        <p className={SECTION_DESC_CLASS}>
          対応プロバイダ: OpenAI / Deepgram。 切り替えると API
          キーの再入力が必要です。
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
                // Reset the model to the new provider's canonical default so a
                // stale model (e.g. `gpt-4o-transcribe` carried into Deepgram)
                // does not break the connection test / real transcribe. This
                // is a Speech-form-only behavior (the LLM form has no reset).
                // Suppress when the model is env-locked so local state does
                // not diverge from the env-pinned value ([arch P-002]).
                if (!envOverrides.model) {
                  setModel(PROVIDER_DEFAULT_MODEL[next]);
                }
              }
            }}
            disabled={isPending || envOverrides.provider}
            data-env-locked={envOverrides.provider || undefined}
            aria-describedby={
              envOverrides.provider ? providerLockHintId : undefined
            }
          >
            {SPEECH_PROVIDERS_TRANSPORT.map((id) => (
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
              <code className={CODE_INLINE_CLASS}>ADMIN_SPEECH_PROVIDER</code>{" "}
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
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>API キー</h2>
        <p className={SECTION_DESC_CLASS}>
          環境変数{" "}
          <code className={CODE_INLINE_CLASS}>ADMIN_SPEECH_API_KEY</code>{" "}
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
              {settings.speech.apiKeySource === "env"
                ? "環境変数から読み込み中"
                : settings.speech.apiKeyMasked !== null
                  ? `DB に保管されたキーを使用中 (${settings.speech.apiKeyMasked})`
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
              placeholder={PROVIDER_API_KEY_PLACEHOLDER[provider]}
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
              ? "環境変数 ADMIN_SPEECH_API_KEY で固定されているため変更できません。"
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
        <p className={SECTION_DESC_CLASS}>音声の文字起こしで使用するモデル。</p>
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
            例: {PROVIDER_DEFAULT_MODEL[provider]}
          </p>
          {envOverrides.model ? (
            <p className={LOCK_HINT_CLASS} id={modelLockHintId}>
              環境変数{" "}
              <code className={CODE_INLINE_CLASS}>ADMIN_SPEECH_MODEL</code>{" "}
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
