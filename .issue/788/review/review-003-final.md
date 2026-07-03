# PR #813 レビュー round-3（最終・収束確認） — Issue #788: Cloudflare Workers AI speech ルート追加

**PR:** #813（branch `issue/788/speech-workers-ai-route`） / **Date:** 2026-07-01 / **Round:** 3（収束確認）
**参照:** `.issue/788/plan.md` / `.issue/788/adr.md`（ADR-001〜008） / `review-001*.md` / `review-002*.md`
**検証:** `gh pr diff 813` の最新全差分 + 実ソース突き合わせ。`pnpm typecheck` / speech 関連 unit + integration をローカル実測。

## 総評

round-1（Warning 8件）・round-2（Warning 1件）の全指摘が**反映または見送り記録済み**であることを確認した。全レイヤー横断のフル再レビューでも新規 Blocker・要修正 Warning は検出されなかった。keyless carve-out は 6 apiKey ゲートすべてに一貫して入り、REST 経路（openai/deepgram/gemini）は無改修で非回帰。DI は request/consumer/tester の 3 経路すべてで binding を漏れなく adapter まで届ける。port 契約・`env.AI.run` 型適合・ADR-008 の wrangler 設定非対称・テンプレ binding 宣言もいずれも設計どおり。**APPROVED。**

### round-1 / round-2 指摘の反映確認

| ラウンド | 指摘 | 仕分け | 反映確認 |
|---|---|---|---|
| r1 domain W-001 | keyless の env/null 不変条件が VO でなく usecase 正規化で担保 | 見送り | `LLMConfig` 対称・ADR-004・6 ゲート carve-out で到達不能。r2 で JSDoc 注記を追加し収束（下記） |
| r1 adapter-di W-001 | keyless 判定ヘルパ名が provider 固有 | 直す | `isKeylessSpeechProvider`（`serverCloudflare.ts:642`）へ改名済み。旧名 grep 0 件 |
| r1 adapter-di W-002 | DB 行 keyless 解決の実 prod 経路 DI テスト欠落 | 直す | `createConsumerContainer.integration.test.ts` に解決成功 + binding 無し Stub の 2 ケース追加 |
| r1 frontend W-001 | keyless 時 `htmlFor` ダングリング + 文言矛盾 | 直す | `index.tsx:359`（`htmlFor={keyless ? undefined : apiKeyId}`）+ `:361` 中立文言 |
| r1 frontend W-002 | `KEYLESS_PROVIDERS` ミラーに drift 検出なし | 直す | named export 化（`:43`）+ `SpeechSettingsForm.keyless.test.ts` |
| r1 test W-001 | `config.model` 無視挙動未検証 | 直す | `workersAiSpeechRecognitionProvider.test.ts` に model 投入でも `@cf/deepgram/nova-3` 検証 |
| r1 test W-002 | `run()` reject 時 cause 保持未検証 | 直す | 同ファイルで `cause` toBe アサーション追加 |
| r1 test W-003 | 二重リスト直接比較なし | 直す | `schema.test.ts` / `valueObject.test.ts` でソース定数どうし set-equal 比較 |
| r2 backend W-001 | 見送り domain W-001 の代替 JSDoc 一行未反映 | 直す | `valueObject.ts:318-323` に「keyless の env/null 正規化は usecase 層の責務、`create` は構造的に強制しない」を明記 |

r2 で残った唯一の Warning（backend W-001）の JSDoc は `valueObject.ts:318-323` に確かに追加されている。これで round-2 の未反映事項はゼロ。

---

## Final Review

### Blockers
- なし

### Warnings
- なし

### Notes

- **[N-001]** 6 apiKey ゲートすべてに keyless carve-out が入り、REST は構造的に非波及。①domain service `assertSpeechEnvOverride`（`service.ts:105-107` 先頭で `!requiresApiKey` なら `cfg` verbatim 返却）②usecase `updateSpeechConfig`（`:81` `providerChanged && ciphertext===null && !keyless` で throw、keyless は `:89-99` で `env`/null 明示正規化）③usecase `testSpeechConnection`（`:84-85` `!keyless && 空鍵` のみ早期リターン）④DI request `buildSpeechRecognitionProvider`（`:668-681` keyless は binding+model 駆動・apiKey 無視、binding 無し Stub）⑤DI consumer `resolveConsumerSpeechConfig`（`:1259-1262` `(!keyless && apiKey===null)`、`:1264` `apiKey ?? ""`）⑥tester `HttpSpeechConnectionTester.ping`（`:47-49` `!keyless && 空鍵` のみ短絡）。keyless=`!requiresApiKey` により REST は常に keyless=false で carve-out 不発火。7 番目のゲートは無い。

- **[N-002]** keyless 述語の SSOT が domain 唯一に集約され依存方向が保たれている。判定源は `SpeechRecognitionConfig.requiresApiKey`（`valueObject.ts:316`）のみ。domain service・usecase 2 本・DI 2 本（`isKeylessSpeechProvider` 経由）・tester が同一述語を参照。`isKeylessSpeechProvider`（`serverCloudflare.ts:642`）は domain 述語の否定への薄い委譲で、JSDoc が SSOT は domain 側・命名は generic で将来 keyless provider に耐える旨を明記。`Ai`/binding 型はドメインのロジックに一切現れない。

- **[N-003]** DI が binding を request/consumer/tester の 3 経路すべてで adapter まで届ける（沈黙 Stub 化の穴なし）。request: `readRequestServerConfig` `...(env.AI ? { aiBinding: env.AI } : {})`（`:427`）→ `buildSpeechRecognitionProvider(..., aiBinding)`（`:788`）+ `new HttpSpeechConnectionTester(..., aiBinding)`（`:814`）。consumer: `buildSpeechRecognitionProvider(resolvedSpeech.provider, apiKey, model, env.AI)`（`:1014-1021`、audio 文字起こしが走る点で raw binding 直注入）。tester: keyless で empty-key 短絡をスキップし `adapter.ping(cfg, "", timeoutMs, { ai })`（`speechConnectionTester.ts:63-68`）。

- **[N-004]** port 契約・`env.AI.run` 型適合が正確。`SpeechAdapterConfig` は `{ apiKey, model }` の純データ維持（ADR-002）、binding は別型 `SpeechAdapterDeps = { ai?: Ai }`（`registry.ts:39`）として `create`/`ping` の追加引数に分離。REST barrel は `deps?` optional で無改修・`satisfies SpeechAdapter` 維持。adapter は binding 未注入 → `SpeechFailureError`、`run()` reject → cause 保持で wrap、空/欠落 transcript → `""`、timeout は `Promise.race`+自前タイマー+`finally clearTimeout`（ADR-007）。`config.model` を意図的に無視しリテラル `@cf/deepgram/nova-3` を使う理由も `:59-61` に明記。ping は `run()` 非呼出で binding 存在のみ判定（ADR-005）。typecheck green で `Ai.run` overload 適合を担保。

- **[N-005]** ADR-008（ローカル `[ai]` 除去）とテンプレ binding 宣言が整合。`wrangler.toml` は top-level（`:109-120`）と `[env.consumer]`（`:207-`）双方で `[ai]` を省き、なぜ省くか+ローカル有効化手順をコメントで明記。`infra/templates/wrangler.{staging,production}.toml.tmpl` は web worker（`[ai]` `:78-79`）+ consumer（`[env.consumer.ai]` `:159-160`）の両方で binding を宣言。web worker 側の宣言は接続テスト ping（request 経路）に、consumer 側は実文字起こしに必要で、いずれも配線先と一致。

- **[N-006]** テストが AC-6 の対称性を振る舞いで網羅。adapter 単体は 正常 `.trim()` / 空 transcript / 欠落 transcript / binding 未注入 `SpeechFailureError` / `run` reject cause 保持 / timeout（実タイマー + never-resolve run で `Promise.race` 決定発火）/ locale 主サブタグ抽出を fake `Ai`（run 差し替え）で固定。二重リスト不変条件は `schema.test.ts` / `valueObject.test.ts` / `SpeechSettingsForm.keyless.test.ts` がソース定数どうしを set-equal 比較しドリフトを赤くする。DI/usecase/domain service の keyless 分岐は seam + 実 D1 行で固定（keyless 保存の env/null 正規化・旧 ciphertext 非引き継ぎ・stray-key silent-drop・consumer 解決・tester dispatch）。unit 450 + integration 91 が緑。

- **[N-007]** keyless の apiKey silently-drop が意図どおり実装・文書化（`updateSpeechConfig.ts:38-43` JSDoc + `:89-99` 分岐）。UoW 前の無条件 encrypt は `effectiveProvider` が env ロック時に UoW 内でしか確定しない構造的制約由来でコメント根拠あり。admin-gated かつ軽量で許容範囲。round-2 frontend-test の補足（keyless × env キュー誤設定時の軽微な label 文言不整合）は矛盾構成前提かつ鍵が drop されるため実害なし・非指摘化の判断を踏襲。

### 品質ゲート結果

- **typecheck:** `pnpm typecheck`（tsgo）— **PASS**（エラーなし）。
- **tests（unit）:** `pnpm vitest run app/core/adapters/deepgram app/core/adapters/speech app/core/domain/adminSettings app/core/application/adminSettings app/core/application/di app/components/admin` — **PASS**（23 files / **450 tests passed**）。
- **tests（integration・workers pool）:** `pnpm vitest run --config vitest.config.integration.ts app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts app/core/application/di/__tests__/createConsumerContainer.integration.test.ts` — **PASS**（2 files / **91 tests passed**）。keyless 保存正規化・ciphertext 非引き継ぎ・stray-key drop・consumer 解決・DB 行 keyless 解決の DI テストを含む。

## 最終判定

**APPROVED** — Blocker 0 / Warning 0。round-1（8件）・round-2（1件）の全指摘が反映または見送り記録済み。新規 Blocker・要修正 Warning なし。typecheck / unit（450）/ integration（91）すべて緑。webm/opus 実受理は ADR-006 どおり staging 検証待ち（本 Issue の opt-in 設計で既存経路は無傷）であり、マージ阻害要因ではない。
