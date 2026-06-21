# Review 001 — Frontend（admin speech 設定フォーム）

**PR:** #765
**観点:** Frontend（`/admin/speech` の provider 分岐・model 自動リセット・transport 同期）
**対象 AC:** AC-3 / AC-4
**結論:** Blocker なし。AC-3 / AC-4 とも満たされている。

## 受け入れ基準の検証

### AC-3（provider select に Deepgram / 型網羅）— 充足

- `app/components/admin/schema.ts:72` `SPEECH_PROVIDERS_TRANSPORT = ["openai", "deepgram"] as const`。
- `SpeechSettingsForm/index.tsx:258-262` で `SPEECH_PROVIDERS_TRANSPORT.map` により `<option>` を生成。Deepgram が自動追加される。
- `SpeechSettingsForm/index.tsx:32-35` `PROVIDER_LABEL: Readonly<Record<ProviderId, string>>` で `openai` / `deepgram` を網羅。`ProviderId` は transport 由来（28 行）なので、provider 追加時にキー欠落はコンパイルエラーで検出される（型網羅強制 OK）。

### AC-4（既定 model 切替・API キー placeholder 切替・provider 切替時 model リセット・env ロック時抑制）— 充足

- `PROVIDER_DEFAULT_MODEL`（43-46）= `{ openai: "gpt-4o-transcribe", deepgram: "nova-3" }`。値は plan / Issue 指定どおり。`Record<ProviderId, string>` で網羅強制。
- provider `onChange`（237-251）: `if (isProviderId(next)) { setProvider(next); if (!envOverrides.model) { setModel(PROVIDER_DEFAULT_MODEL[next]); } }`。
  - リセット挙動が AC-4 核として正しく実装されている。
  - env ロック時（`envOverrides.model === true`）はリセットを抑制（[arch P-002] の要件を満たす）。
- API キー placeholder（337）: `PROVIDER_API_KEY_PLACEHOLDER[provider]`（50-53）= `{ openai: "sk-...", deepgram: "Token ..." }`。provider 連動 OK。
- model ヒント文言（415-417）: `例: {PROVIDER_DEFAULT_MODEL[provider]}`。provider 連動で「例: gpt-4o-transcribe」/「例: nova-3」に切り替わる。固定文言ハードコード（旧 203/386 行）が解消されている。

## transport / domain 二重リスト同期 — OK

- domain `SPEECH_PROVIDERS`（`valueObject.ts:269`）= `["openai", "deepgram"]`。
- transport `SPEECH_PROVIDERS_TRANSPORT`（`schema.ts:72`）= `["openai", "deepgram"]`。両者一致。
- default-model INVARIANT コメント（`valueObject.ts:264-265`）も `openai → gpt-4o-transcribe` / `deepgram → nova-3` を記載し、`PROVIDER_DEFAULT_MODEL` と一致。ドリフト防止のコメント規約（VO 構築で `InvalidSpeechProvider` fail-fast）も維持。
- `schema.test.ts:195-198` で `SPEECH_PROVIDERS_TRANSPORT` の中身を直接アサートし、ドリフト回帰を CI で検出。

## スタイル / アクセシビリティ / 状態管理 — OK

- React 19 controlled state（`useState` + `useActionState` + `useTransition`）。LLM フォームと対称。
- `data-env-locked={envOverrides.x || undefined}` 等、CLAUDE.md ADR-003 の `value || undefined` 規約に準拠。
- utility-first Tailwind。ハードコード CSS / `@apply` の新規追加なし。
- env ロックの `disabled`（provider 252 / model 411 / apiKey 341）と aria-describedby のロックヒント連携は LLM フォームと同水準。
- 既存 OpenAI フォーム挙動（providerChanged 警告・apiKeyRequired バッジ・接続テスト・persisted 状態表示）に回帰なし。

## Blockers

なし。

## Warnings

なし。

## Notes

- [N-001] provider→model 自動リセットは「ユーザーが手動編集した model」も無条件に破棄する — 説明 / `SpeechSettingsForm/index.tsx:247-249` / 理由: 例えば OpenAI を選択中にユーザーが `whisper-1` を手入力 → 一旦 Deepgram に切替 → 再度 OpenAI に戻すと、手入力値は失われ `gpt-4o-transcribe` に戻る。これは plan が明示的に選んだ仕様（持ち越しによる接続テスト失敗の回避が目的、OpenAI フォームには無い Speech 固有挙動）であり AC-4 とも整合するため許容。ただし将来 provider あたりの model 選択肢が増えた場合に再考の余地あり。提案: 現状は変更不要。挙動はコメント（242-246）に明記済みで意図が追える。

- [N-002] `persistedProvider` のフォールバックコメント（99-103）が「DTO's `provider` is typed by the domain and could drift」と書くが、実際の DTO 型 `SpeechProviderName`（= domain `SpeechProvider` = `"openai" | "deepgram"`）は厳格 union であり transport と論理的に一致している — 説明 / `SpeechSettingsForm/index.tsx:99-106` / 理由: 防御的ナローイング自体は LLM フォームと対称で害はないが、コメントの「typed as string」ニュアンスは LLM フォームからのコピーで、Speech 側 DTO の実態（union 型）と微妙にずれる。実害なし。提案: 任意。Issue スコープ外。

- [N-003] provider select の `value` 文字列が `PROVIDER_DEFAULT_MODEL` / `PROVIDER_API_KEY_PLACEHOLDER` / `PROVIDER_LABEL` の 3 つの `Record<ProviderId, ...>` を横断する。いずれも型網羅でキー欠落をコンパイル検出できるため整合性は型で保証済み — 説明 / 32-53 / 理由: 3 マップの追従漏れリスクは型で閉じている。指摘ではなく確認事項。
