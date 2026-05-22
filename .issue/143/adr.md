# ADR — Issue #143: feat(admin/llm): surface env override state in UI

## ADR-001: env override 項目への save 受信は silent skip

### Status
Proposed

### Context

`/admin/llm` で env override されている field（例: `ADMIN_LLM_PROVIDER` set 時の provider）に対し、UI 側で disabled + submit 除外を実装する。しかし transport へ直接 POST された場合の振る舞いを決める必要がある:

- **案 A: silent skip** — env override 項目は usecase で破棄し、env / DB の既存値を保持。warn ログのみ
- **案 B: BusinessRuleError(EnvOverrideForbidsSave) で reject** — 422 / 409 でエラー返却

### Decision

**案 A（silent skip）** を採用する。

### Consequences

- 良い点:
  - ADR-007（env override > DB > Stub）の優先順位と semantic 一貫性が取れる。env override は「常に env が勝つ」ルールなので、reject ではなく「無視」が自然
  - UI で disabled なため通常経路では発生しない異常系。reject はノイズ過剰
  - 既存 `AdminSettingsService.assertEnvOverride` の apiKey 処理が既に silent override（env が set されていれば DB ciphertext を drop）しており、provider/model/baseURL も同じ方針が揃う
- トレードオフ:
  - 直接 POST する開発者が「保存したのに反映されない」と感じる可能性 → `logger.warn` で監査ログを残し、UI hint で env override 中であることを明示することで補う

---

## ADR-002: env presence 判定は `value.length > 0`（trim しない、4 field 共通）

### Status
Proposed

### Context

`ADMIN_LLM_BASE_URL=""` などの空文字を env で設定するケースがある。これを「override 無し」「override 有り（空文字）」のどちらとみなすかを決める必要がある。consumer 経路の既存実装と semantics を揃えることが重要（admin UI と consumer で判定が分かれると Issue #143 で潰したい UX bug が再発する）。

### Decision

`value !== undefined && value.length > 0` で判定する。trim しない。4 field（apiKey / provider / model / baseURL）共通でこの判定を採用する。

`app/core/application/di/serverCloudflare.ts:680` の `envBaseURL !== undefined && envBaseURL.length > 0` と完全一致させる。

### Consequences

- 良い点:
  - consumer 経路 `resolveConsumerLlmConfig` の env presence 判定と完全一致 → admin UI と consumer の挙動が乖離しない
  - 開発者が `.dev.vars` の `ADMIN_LLM_*=""` を「未設定」と意図するのと整合
  - 4 field 共通ロジックで実装が単純
- トレードオフ:
  - 「whitespace 1 文字で固定したい」ような edge ケースは consumer が「override 有り」と判定するため UI と一致する。実害なし
  - 「明示的に空 base URL で固定したい」ニーズに応えられない。ただし OpenAI 本家は base URL を SDK default に任せれば同じ結果になるため実害なし

---

## ADR-003: DTO の provider/model/baseURL 表示値は env 由来現値で上書き

### Status
Proposed

### Context

env override されている field の admin UI 表示値として「DB 値」と「env 由来の現値」のどちらを返すかを決める必要がある。Issue 本文では「表示値は env 由来の現値（DB 値ではなく実行時の有効値）」と明記されている。

### Decision

env override されている field の DTO 値は env の現値で上書きする。DB の古い値が残っていても UI には実行時の有効値を返す。

### Consequences

- 良い点:
  - admin が UI で見る値 = 実際に LLM 呼び出しで使われる値、という不変条件を maintain
  - Issue 要件と一致
- トレードオフ:
  - DB に残った値と DTO 値が乖離するが、env override 中はそもそも DB 値が使われないため副作用なし
  - api key だけは boolean 化（実値は流さない）で例外的に扱う

---

## ADR-004: env reconcile は application 層完結（domain には追加しない）

### Status
Proposed

### Context

env override の 4 field reconcile を `AdminSettingsService` に新規 `applyEnvOverrides` として追加するか、application 層 (`view.ts` / `updateLLMConfig.ts`) で完結させるか。

### Decision

application 層で完結する。domain は触らない。

### Consequences

- 良い点:
  - env はインフラ runtime configuration であり、domain invariant（VO state）ではない。レイヤー責務として正しい
  - 既存 `AdminSettingsService.assertEnvOverride` が apiKey 処理を担うのは `apiKeySource = 'env'` という VO state を維持するため。provider/model/baseURL には VO 上の `*Source` フィールドが無いので domain 拡張不要
  - 変更面積が最小、テストも application 層で完結
- トレードオフ:
  - env override ロジックが usecase / view の 2 箇所に分かれる懸念 → 同じ判定関数を `view.ts` から export して `updateLLMConfig.ts` でも使えば DRY を保てる

---

## ADR-005: silent skip 時の DB 書き込み方針は「DB の現状維持」

### Status
Proposed

### Context

ADR-001 で silent skip を採用した。env override 項目の input を受け取った場合、usecase は DB に対して以下のどちらの操作を行うべきか:

- 案 X: env 値で DB を上書き（DB と env を同期）
- 案 Y: 何もしない（DB の現状を維持）
- 案 Z: input 値で DB を上書き（input を保存しつつ実行時は env が勝つ）

### Decision

**案 Y（DB の現状維持）** を採用する。env override 項目は `current.llm.<field>` を採用して既存 DB 値を保つ。

### Consequences

- 良い点:
  - 「env override 時は DB の書き込みも skip」というルールが明確で予測しやすい
  - env が外れた後に DB に残った値で fallback できる挙動を維持（ADR-007 の DB resolution fallback と整合）
  - 案 X は env 値が rotation するたびに DB 同期する副作用が発生して複雑
  - 案 Z は「保存したのに反映されない」UX 上の混乱を生む
- トレードオフ:
  - DB に古い値が残るが、env override 中は使われないため実害なし。env が外れた瞬間に古い値で動く可能性はあるが、それは ADR-007 の DB resolution fallback の意図そのもの
  - silent skip log で field 名だけ残せば監査可能

---

## ADR-006: UI は `disabled` 統一採用（`readOnly` 不採用）

### Status
Proposed

### Context

env override 項目の UI 表現として `<input disabled>` と `<input readOnly>` のどちらを使うかを決める必要がある。挙動が異なる:

- `disabled`: ユーザー操作不可、HTML 仕様で formData に乗らない（提出されない）
- `readOnly`: ユーザー編集不可だが、formData には乗る（提出される）

### Decision

`disabled` を統一採用する。`<select disabled>` も同様。

### Consequences

- 良い点:
  - HTML 仕様で formData から自動除外されるため、明示的な JS 除外ロジックが不要（コード簡素化）
  - フォーム submit 時に env override 項目が transport に乗らない → usecase の silent skip は最終防衛線として残るが、通常経路で発動しない
  - キーボード focus も skip され UX 上 lock 状態がより明確
- トレードオフ:
  - `disabled` の input は accessibility ツリーで「不活性」扱いになる。env override の hint テキストと badge を別要素で提供することで補う
  - `disabled` のスタイリングがブラウザ default に依存するため、Tailwind の `disabled:` variant で見た目を整える必要あり

---

## ADR-007: `toInstanceSettingsView` / `toInstanceSettingsDTO` accept nullable `env`

### Status
Accepted (implementation)

### Context

実装時に `view.ts` の `toInstanceSettingsView(settings, env)` 引数を必須化すると、既存の `view.test.ts` を含む全 caller を修正する必要がある。一方、env 情報が無い caller（domain 層の round-trip テスト、シンプルな DTO 整合性テスト等）にとって env は本質的ではなく、`AdminSettingsEnv` を都度 fabricate するのはノイズ。

### Decision

`toInstanceSettingsView` の `env` パラメータをデフォルト引数 `env: AdminSettingsEnv | null = null` とし、`toInstanceSettingsDTO` の `llmEnv` パラメータも `null` 受容にする。`null` は「env 情報なし」とみなし、すべての `envOverrides.*` を `false` にして DB 値をそのまま DTO に流す。`null` を「全項目 false」のショートカットとして扱うことで既存 caller を破壊せず、新規 caller（`getInstanceSettings`）だけが `container.adminSettingsEnv` を渡せばよい。

### Consequences

- 良い点:
  - 既存 `view.test.ts` の DTO 整合性テストが `env` 引数なしで動作し続ける
  - `getInstanceSettings` のような env を持つ caller は明示的に渡す
  - DTO 層と env 概念の結合度が最小化される（DTO は env を「知らない」モードでも動作）
- トレードオフ:
  - `env` の有無で `envOverrides` 出力が変わる → caller によって UI が env-aware かどうか分かれる
    - 実際は presentation 経路のみが env-aware にすべきなので問題なし
  - `null` を「未指定」マーカーとして使う TS 上の anti-pattern とも見えるが、`AdminSettingsEnv` 自体を「全部 null」で作るより読みやすい

---

## ADR-008: `assertEnvOverride` の apiKey trim 挙動を本 Issue では維持

### Status
Accepted

### Context

レビュー review-001 で `app/core/domain/adminSettings/service.ts:49` の `assertEnvOverride` 内 apiKey 判定が `trim().length === 0` を「未設定」と扱う点が ADR-002（`length > 0`、trim しない、4 field 共通）と細部不一致だと指摘された。

具体的には:

- ADR-002 / 本 Issue の DI 層（`serverCloudflare.ts`）と consumer 経路（`resolveConsumerLlmConfig`）は `value !== undefined && value.length > 0` で envOverrides 判定
- 一方 `AdminSettingsService.assertEnvOverride`（apiKey 専用）は内部で `trim().length === 0` を「envApiKey 未設定」と扱う

このため、`env.apiKey === " "`（whitespace-only）のケースで:
- admin UI / consumer は「env.apiKey set」と判定（length > 0）
- `assertEnvOverride` は「未設定」とみなして DB 値を維持

という細い乖離が生じうる。

### Decision

本 Issue（#143）のスコープでは `assertEnvOverride` の trim 挙動を**維持**する。修正は別 Issue で扱う。

### Consequences

- 良い点:
  - 既存テスト `app/core/domain/adminSettings/__tests__/service.test.ts:83 "treats whitespace-only env.apiKey as missing"` を翻す必要がない（影響範囲が広い）
  - 本 Issue の主目的（UI lock 表示と save silent skip）は trim 不一致と独立に成立する
  - Phase 4 で W-UC-001 / W-DI-001 / W-S-003 を一括対応する follow-up Issue を起票して、ADR-002 と service.ts:49 を整合させる方針が明確
- トレードオフ:
  - whitespace-only apiKey で admin UI（env.apiKey set 表示）と save 経路（DB 値を使う）に細い乖離リスクが残る。実害は低い（whitespace を意図的に env apiKey として設定するユースケースは非現実的）
  - follow-up Issue を起票する責務をメインエージェント（Phase 4）に委譲
