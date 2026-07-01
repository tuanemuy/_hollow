# Round 3 レビュー（最終） — Issue #788（視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/788/plan.md` / `.issue/788/adr.md`（round-1/round-2 反映後）
レビュー観点: ゲート網羅性の最終確認・keyless 述語 SSOT 設計・依存方向・実現可能性・残存リスク

総評: round-1（P-001/P-002・S-001〜004）と round-2（P-001 `assertSpeechEnvOverride`・S-001/S-002）の全指摘が plan/ADR/DoD/テスト方針に一貫反映済み。今回の最重要タスク（apiKey ゲートの網羅性最終確認）を実コードで徹底検証した結果、**keyless（workers-ai）経路をブロックするサーバ側 apiKey ゲートは 6 箇所で確定・打ち止め。7 番目は存在しない。** keyless 述語を domain SSOT に置く設計・依存方向・consumer 経路配線・timeout 手段のいずれも実現可能。**新たな問題点ゼロ。承認する。**

---

#### ゲート網羅性の最終検証（実コード照合）

`app/core/domain/adminSettings/` / `app/core/application/adminSettings/` / `app/core/application/di/` を `apiKey` / `apiKeySource` / `resolvedKey` / `Stub` / `return null` / `throw` で網羅 grep し、keyless 保存・接続テスト・consumer 解決の全経路をトレースした。plan/ADR が列挙する 6 ゲートと一対一で照合:

**domain layer（1）:**
1. `AdminSettingsService.assertSpeechEnvOverride`（`service.ts` L98-104）: `env.apiKey===null|"" && cfg.apiKeySource==='env'` → `SpeechEnvOverrideMissingKey` throw。`updateSpeechConfig` L91 が draft 直後に呼ぶ。plan ステップ 4(c) の carve-out で対応。✓

**application layer（5）:**
2. usecase `updateSpeechConfig`（`updateSpeechConfig.ts` L68-74）: `providerChanged && apiKeyCiphertext===null` → `SpeechProviderChangedRequiresApiKey` throw。加えて else 枝 L84-89 が旧 `apiKeySource`/`apiKeyCiphertext` を流用（plan ステップ 4(b) の正規化で対応）。✓
3. usecase `testSpeechConnection`（`testSpeechConnection.ts` L80-86）: `resolvedKey===null||空` → "No api key available" early-return。plan ステップ 5 で対応。✓
4. DI `buildSpeechRecognitionProvider`（`serverCloudflare.ts` L630）: `if (!adminSpeechApiKey || !adminSpeechModel) return Stub`。単一関数・単一ゲートで、request（L731）と consumer（L957）の**2 呼び出し元が共に通過**する。plan ステップ 7 で対応。✓
5. DI `resolveConsumerSpeechConfig`（`serverCloudflare.ts` L1192）: `if (provider===null||model===null||apiKey===null) return null`（沈黙 Stub）。plan ステップ 8 で対応。✓
6. tester `HttpSpeechConnectionTester.ping`（`speechConnectionTester.ts` L36-38）: `trimmedKey.length===0` → "API key is empty" 短絡。plan ステップ 9 で対応。✓

**7 番目が無いことの確認（keyless 経路トレース）:**
- **保存経路**（`updateSpeechConfig`）: ゲート 2 → draft 生成（`SpeechRecognitionConfig.create` は provider 非依存の apiKeySource/ciphertext 検証のみ・keyless は env/null で通過、新ゲートなし）→ ゲート 1 → `InstanceSettings.updateSpeech` / save（apiKey throw なし）。ゲートは 1・2 のみ。
- **接続テスト経路**（`testSpeechConnection`）: ゲート 3 → `speechConnectionTester.ping` → ゲート 6。ゲートは 3・6 のみ。
- **request/consumer コンテナ構築**: ゲート 4（両呼び出し元）／consumer は ゲート 5 → ゲート 4。
- `adminSpeechEnv.apiKey` 構築（L785-798）は `? : null` のデータ正規化で throw/early-return なし → ゲートではない（ゲート 1・3 の入力を作るだけ）。
- `decryptSpeechApiKey`（L82-84）は env のとき null を返すのみ・throw なし → 独立ゲートではない（ゲート 3 の resolvedKey を null にする一段）。
- `buildSpeechRecognitionProvider` L634-635 の 2 つ目の Stub は「未登録 provider（typo）」フォールバックで、`deepgram-workers-ai` を registry 登録すれば解決されるため keyless ブロッカーではない。
- スコープ 3 ディレクトリ内に他の speech 固有 throw/return-null/Stub は無し（grep 済み）。

→ **6 箇所で網羅完了。round-1 の 4→5、round-2 の 5→6 で確定した数え上げが今回安定した。7 番目は存在しない。** 内訳（domain service 1 + application 5: usecase 2 + DI 2 + tester 1）は DoD・設計節・ステップ・リスク節・テスト方針・ADR-004 の全箇所で一致。

---

#### 実現可能性の最終確認

- **keyless 述語 SSOT の配置**: `service.ts` は既に `import { LLMConfig, SpeechRecognitionConfig } from "./valueObject"` 済み。`SpeechRecognitionConfig.requiresApiKey`（or `KEYLESS_SPEECH_PROVIDERS`）を `valueObject.ts` に足して domain service が直接参照する設計は、新規依存ゼロで成立。既存の `.providers`/`.apiKeySources`/`.create` namespace-object パターンと同形で追加可能。✓
- **依存方向**: domain service → domain VO 述語（内向き）、application/DI の `isWorkersAiSpeechProvider` → domain 述語への薄い委譲。逆流なし。ドメインは binding（`Ai`）を一切知らないまま。✓
- **consumer 経路配線**: `createConsumerContainer(env: ServerEnv)` は raw `env` を保持するので L957 の呼び出しへ `env.AI` を直接渡せる。request 側 L731 は `config.aiBinding`（RequestServerConfig 経由・plan ステップ 6 で threading）で供給。両呼び出し元とも binding 供給経路が用意され、配線ギャップなし。✓
- **`env.AI.run` 契約 / timeout 手段**: round-1 で `Ai_Cf_Deepgram_Nova_3_Input/Output` の型適合と `AiOptions` に signal/timeout フィールドが無いことを裏取り済み。`Promise.race` + 自前タイマーで `SpeechFailureError` を満たす方針・run() 非キャンセル注記も plan に反映済み。今回の型定義に変化はなく前提は維持。✓
- **ADR-004 の非対称性**（REST=apiKey 駆動 / workers-ai=binding 駆動）は spec / domain service / DI / usecase JSDoc へ明記する方針で、運用上の混乱リスクは文書化で吸収。✓

---

#### 問題点（要修正）

- **問題点ゼロ。** 実現可能性を崩す実質的な穴は無い。ゲート網羅性・依存方向・配線・timeout のいずれも確認済み。

#### 改善提案（検討推奨）

- なし（round-1/round-2 で出した提案は全反映済み。新規に無理な粗探しはしない）。

#### 良い点

- apiKey ゲートの enumeration を round ごとに実コードで詰め、4→5→6 と収束させたうえで、6 箇所すべてを **domain SSOT 述語で一貫分岐**する設計に統一した点。ドリフト源を単一述語に集約したのは保守性・回帰耐性ともに的確。
- `assertSpeechEnvOverride`（真の domain service）と `updateSpeechConfig` の `SpeechProviderChangedRequiresApiKey`（domain error code を使う application 不変条件）を round-2 [S-001] で明確に区別記述した点。層の責務を取り違えず carve-out の置き場所が正しい。
- keyless での apiKey 誤入力 silently-drop（round-2 [S-002]）を JSDoc + テスト 1 ケースで固定する方針。将来の「鍵が保存されない」バグ報告との切り分けを先回りしている。
- 実 `env.AI` 到達不可という制約に対し、型契約による静的 PoC + staging implement-then-verify/revert（ADR-006）と偽陽性警戒（`runIngestionJob` の `SpeechFailureError` 握り潰し）で現実的に着地。DoD とクローズ条件をマージ可否／staging 確定に分離した設計も堅実。
- consumer 経路の沈黙 Stub リスクを E2E の要と名指しし、DI unit テストで固める方針。blast radius 管理として的確。

---

#### まとめ

3 周のレビューで apiKey ゲートは **6 箇所で確定・網羅完了**（7 番目なし）。keyless 述語 SSOT・依存方向・consumer 配線・timeout 手段のいずれも実現可能で、AC-3（保存・接続テスト）/ AC-4（フルパス）の必須条件が計画に揃っている。webm/opus 受理の実機確定は ADR-006 どおり staging ゲート依存だが、これは環境制約由来で計画の瑕疵ではなく、revert 運用も原子的に設計されている。**最終確認として承認する（APPROVED）。**
