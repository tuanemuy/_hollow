# レビュー review-001 — Domain / Frontend 配線（PR #794 / Issue #766）

対象: Gemini audio 文字起こしプロバイダの registry 追加。
観点: domain union ↔ transport list の原子性、default-model 二重管理の整合、UI provider 分岐 Record の網羅、closed literal union の型レベル exhaustiveness、`defaultSpeech()` の既定維持、スタイル規約適合。

検証した配線:
- `app/core/domain/adminSettings/valueObject.ts` L270 `SPEECH_PROVIDERS = ["openai","deepgram","gemini"]` / INVARIANT コメント L258-269
- `app/components/admin/schema.ts` L72-76 `SPEECH_PROVIDERS_TRANSPORT = ["openai","deepgram","gemini"]`
- `app/components/admin/SpeechSettingsForm/index.tsx` L32-56（3 Record）/ L223 説明文
- `app/core/adapters/speech/registry.ts` L49-53 `Record<SpeechProviderId, SpeechAdapter>`
- `app/core/adapters/gemini/index.ts` L35-49 `geminiSpeechAdapter satisfies SpeechAdapter`
- `app/core/domain/adminSettings/entity.ts` L56-63 `defaultSpeech()`
- `app/core/application/di/serverCloudflare.ts` L622-634 / L1146-1156（generic dispatch・default-model 非依存）

## Domain / Frontend 配線

### Blockers
- なし

AC-2 に必要な配線はすべて揃っており、型安全性も担保されている。

1. **domain union と transport list が原子的に揃っている** — `SPEECH_PROVIDERS`（domain, valueObject.ts L270）と `SPEECH_PROVIDERS_TRANSPORT`（transport, schema.ts L72-76）が両方とも `["openai","deepgram","gemini"]`。片方欠落による `InvalidSpeechProvider` fail-fast のリスクなし。`updateSpeechConfigSchema` / `testSpeechConnectionSchema` の `z.enum(SPEECH_PROVIDERS_TRANSPORT)` も自動的に gemini を受理する。
2. **default-model の整合** — valueObject.ts INVARIANT コメント L266 `gemini → "gemini-2.5-flash"` と UI `PROVIDER_DEFAULT_MODEL.gemini`（index.tsx L47）の `"gemini-2.5-flash"` が文字列一致。provider 切替時の `setModel(PROVIDER_DEFAULT_MODEL[next])`（L251）で既定モデル自動セットが動く。
3. **UI 3 Record すべてに gemini 行** — `PROVIDER_LABEL.gemini="Gemini"`（L35）/ `PROVIDER_DEFAULT_MODEL.gemini="gemini-2.5-flash"`（L47）/ `PROVIDER_API_KEY_PLACEHOLDER.gemini="AIza..."`（L55）。欠落による型エラー・実行時欠落なし。placeholder の `AIza...` は Gemini API キーの実プレフィックスと一致。
4. **closed literal union の exhaustiveness が型で保たれている** — UI 3 Record は `Readonly<Record<ProviderId, string>>`（`ProviderId = (typeof SPEECH_PROVIDERS_TRANSPORT)[number]`）、registry は `Record<SpeechProviderId, SpeechAdapter>`。いずれも transport / domain union に値を足して対応 Record を欠くとコンパイルエラーになる二重ガード。`geminiSpeechAdapter satisfies SpeechAdapter` で port 形状も静的検証済み。
5. **`defaultSpeech()` は openai 据え置き** — entity.ts L57-62 で `provider:"openai" / model:"gpt-4o-transcribe"` のまま。既定プロバイダは変わっていない（AC-2 は「選択肢に追加」であって既定変更ではない）。
6. **説明文のプロバイダ列挙が更新済み** — index.tsx L223「対応プロバイダ: OpenAI / Deepgram / Gemini」。Deepgram 追加時の片落ち（列挙だけ古い）がない。

### Warnings
- **[W-001]** INVARIANT コメントの「default-model マッピングの利用箇所」記述が実態と乖離 / `app/core/domain/adminSettings/valueObject.ts` L258-269 / コメントは default-model マッピング（openai→gpt-4o-transcribe / deepgram→nova-3 / gemini→gemini-2.5-flash）を「`defaultSpeech()` / DI bootstrap で使う」と説明するが、`defaultSpeech()`（entity.ts L56-63）が消費するのは openai 値のみで、DI bootstrap（serverCloudflare.ts `buildSpeechRecognitionProvider` L622-634 / `resolveConsumerSpeechConfig` L1146-1156）は `ADMIN_SPEECH_MODEL`・DB 行を直読みし**この Record を参照しない**。deepgram/gemini の既定値の唯一の実消費者は UI の `PROVIDER_DEFAULT_MODEL`（SpeechSettingsForm L44-48）。本 PR が新設した乖離ではなく deepgram 追加時から続く既存の不正確さだが、gemini を足したことで「DI で使われる前提のモデル名」を探して見つからない読み手を誘発しうる。提案: コメントの「used by `defaultSpeech()` / DI bootstrap」を「`defaultSpeech()`（openai のみ）と UI の `PROVIDER_DEFAULT_MODEL`（provider 切替時の自動セット）がミラーする」に直し、二重管理の実ペア（valueObject コメント ↔ UI Record）を明示する。Blocker ではない（値自体は整合）。

### Notes
- **[N-001]** transport 二重リストのドリフト耐性が UI 側でも担保されている。`SpeechSettingsForm` の `persistedProvider`（L107-109）と action 内の narrowing（L134-136）が `isProviderId` で防御し、DTO の provider が transport list から外れても `SPEECH_PROVIDERS_TRANSPORT[0]` にフォールバックして描画を継続する。domain が先行追加して transport が遅れた場合でも UI がクラッシュしない設計で、今回の原子更新と相まって安全。
- **[N-002]** スタイル規約（CLAUDE.md）違反なし。UI 変更は Record への 1 行追加 × 3 と説明文 1 箇所のみで、新規 CSS / `@apply` の導入なし。既存の `data-env-locked={... || undefined}`・トークン経由 utility・module-scope 文字列定数（`SECTION_CLASS` 等）パターンを踏襲しており、gemini 追加で新たな state-style や条件付き class 文字列を持ち込んでいない。
- **[N-003]** registry の value-cycle 回避が正しく踏襲されている。`registry.ts` が `../gemini` から adapter **value** を import（L11）、`gemini/index.ts` が `../speech/registry` から `SpeechAdapter` **type のみ** import（index.ts L5）。llm/registry と同型で循環なし。`geminiSpeechAdapter` の `create`/`ping` 形状も openai/deepgram と対称。
