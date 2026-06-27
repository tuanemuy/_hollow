# レビュー review-002 — Domain / Frontend 配線（PR #794 / Issue #766・2周目フル）

対象: Gemini audio 文字起こしプロバイダの registry 追加。
観点: domain union ↔ transport list の原子的整合、default-model 二重管理（valueObject コメント / UI Record）の追従・値整合、UI 3 Record の網羅、closed literal union の型レベル exhaustiveness、`defaultSpeech()` の openai 据え置き、スタイル規約適合。1周目 W-001（INVARIANT コメントの実態乖離）の解消確認を含む。

検証した配線:
- `app/core/domain/adminSettings/valueObject.ts` L258-272 INVARIANT コメント / L273 `SPEECH_PROVIDERS = ["openai","deepgram","gemini"]` / L297 `create` の `InvalidSpeechProvider` ガード
- `app/components/admin/schema.ts` L67-100 `SPEECH_PROVIDERS_TRANSPORT = ["openai","deepgram","gemini"]` / `updateSpeechConfigSchema` / `testSpeechConnectionSchema`
- `app/components/admin/SpeechSettingsForm/index.tsx` L28-56（3 Record）/ L82-84 `isProviderId` / L107-109 `persistedProvider` / L251 `setModel(PROVIDER_DEFAULT_MODEL[next])` / L223 説明文
- `app/core/adapters/speech/registry.ts` L49-53 `Record<SpeechProviderId, SpeechAdapter>`
- `app/core/adapters/gemini/index.ts` L35-49 `geminiSpeechAdapter satisfies SpeechAdapter`
- `app/core/domain/adminSettings/entity.ts` L56-63 `defaultSpeech()`

## Domain / Frontend 配線

### Blockers
- **[B-001]** なし。

AC-2 に必要な domain/frontend 配線はすべて揃い、型安全性も二重ガードで担保されている。

### Warnings
- **[W-001]** なし。

1周目 W-001（INVARIANT コメント実態整合）は適切に解消されている。`valueObject.ts` L261-266 のコメントは現状 **「`openai` 既定のみがここ（`defaultSpeech()`, entity.ts）で消費される。DI bootstrap は `ADMIN_SPEECH_MODEL` / DB 行を直読みし、この mapping を参照しない。per-provider 既定は UI の `PROVIDER_DEFAULT_MODEL`（SpeechSettingsForm）がミラーし provider 切替時に自動セットする」** と記述しており、1周目で提案した実態（実消費者ペア = valueObject コメント ↔ UI Record、DI 非参照）と完全に一致。`serverCloudflare.ts` の `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` がこの Record を参照しない事実とも整合し、deepgram 追加時から続いていた「DI で使われる前提」という誤読誘発が解消された。2周目で新たな乖離は検出されなかった。

### Notes
- **[N-001]** domain union と transport list が原子的に揃っている。`SPEECH_PROVIDERS`（valueObject.ts L273）と `SPEECH_PROVIDERS_TRANSPORT`（schema.ts L72-76）が両方 `["openai","deepgram","gemini"]`。片落ちによる `InvalidSpeechProvider` fail-fast リスクなし。`updateSpeechConfigSchema` / `testSpeechConnectionSchema` の `z.enum(SPEECH_PROVIDERS_TRANSPORT)` も自動的に gemini を受理する。
- **[N-002]** default-model 二重管理の値整合。valueObject コメント L267-269（openai→gpt-4o-transcribe / deepgram→nova-3 / gemini→gemini-2.5-flash）と UI `PROVIDER_DEFAULT_MODEL`（index.tsx L45-47）が 3 値とも文字列一致。`defaultSpeech()`（entity.ts L59）の `gpt-4o-transcribe` もコメントの openai 値と一致。provider 切替時の `setModel(PROVIDER_DEFAULT_MODEL[next])`（L251、env-lock 時は L250 ガードで抑止）で既定モデル自動セットが動作する。
- **[N-003]** closed literal union の exhaustiveness が型で二重に保たれている。UI 3 Record は `Readonly<Record<ProviderId, string>>`（`ProviderId = (typeof SPEECH_PROVIDERS_TRANSPORT)[number]`）で、registry は `Record<SpeechProviderId, SpeechAdapter>`。いずれも union 追加時に対応エントリを欠くとコンパイルエラー。`geminiSpeechAdapter satisfies SpeechAdapter`（gemini/index.ts L49）で port 形状（`create`/`ping`）も静的検証済み。registry の value-cycle 回避（registry が `../gemini` から value import・gemini/index が `../speech/registry` から `type` のみ import）も llm/registry と同型で正しい。
- **[N-004]** `defaultSpeech()` は openai 据え置き。entity.ts L57-62 で `provider:"openai" / model:"gpt-4o-transcribe"` のまま。AC-2 は「選択肢への追加」であり既定変更ではない、という意図どおり既定プロバイダは不変。
- **[N-005]** UI 3 Record すべてに gemini 行（`PROVIDER_LABEL.gemini="Gemini"` L35 / `PROVIDER_DEFAULT_MODEL.gemini="gemini-2.5-flash"` L47 / `PROVIDER_API_KEY_PLACEHOLDER.gemini="AIza..."` L55）。placeholder の `AIza...` は Gemini API キーの実プレフィックスと一致。説明文 L223「対応プロバイダ: OpenAI / Deepgram / Gemini」も列挙片落ちなし。
- **[N-006]** スタイル規約（CLAUDE.md）違反なし。UI 変更は Record への 1 行追加 ×3 と説明文 1 箇所のみ。新規 CSS / `@apply` なし、新たな条件付き class 文字列 / state-style の持ち込みなし。既存の module-scope 文字列定数（`SECTION_CLASS` 等）・`data-env-locked={... || undefined}`・トークン経由 utility を踏襲。`isProviderId` 防御 narrowing（L107-109 / L134-136）により DTO provider が transport list から外れても `SPEECH_PROVIDERS_TRANSPORT[0]` フォールバックで描画継続するドリフト耐性も維持。

## 返答

- Blockers: 0 / Warnings: 0 / Notes: 6
- 各指摘の一行リスト
  - [B-001] なし
  - [W-001] なし（1周目 W-001 = INVARIANT コメント実態乖離は解消確認）
  - [N-001] domain union ↔ transport list が原子的に `["openai","deepgram","gemini"]` で一致
  - [N-002] default-model 二重管理（valueObject コメント ↔ UI Record ↔ defaultSpeech openai）が値整合
  - [N-003] closed union exhaustiveness が registry / UI Record / `satisfies SpeechAdapter` で型担保・value cycle なし
  - [N-004] `defaultSpeech()` は openai/gpt-4o-transcribe 据え置きで既定不変
  - [N-005] UI 3 Record すべて gemini 網羅・placeholder `AIza...` 妥当・説明文更新済み
  - [N-006] スタイル規約適合（新規 CSS/@apply なし）・`isProviderId` ドリフト耐性維持
</content>
</invoke>
