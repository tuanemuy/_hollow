# Round 2 レビュー — Issue #788（視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/788/plan.md` / `.issue/788/adr.md`（round-1 反映後）
レビュー観点: あるべきアーキテクチャとの整合性・依存方向・実現可能性・見落とし・前回指摘の反映

総評: round-1 の指摘（P-001 `SpeechProviderChangedRequiresApiKey`、P-002 testSpeechConnection の 2 段ガード、S-001 timeout、S-002 encoding、S-003 UX、S-004 consumer early-return）はすべて計画・ADR に反映済み。keyless 述語を **domain SSOT（`SpeechRecognitionConfig.requiresApiKey`）** に置き、`isWorkersAiSpeechProvider` を application/DI の薄い委譲ラッパにする設計は依存方向として正しく、実コード（`valueObject.ts` に `.providers`/`.apiKeySources`/`.create` が並ぶ既存構造）とも整合する。ドメインは binding（`Ai`）を一切知らないままなので内向き依存も壊れていない。

ただし **apiKey ゲートの enumeration がまだ 1 箇所漏れている**。plan/ADR-004 は「apiKey ゲートは 5 箇所（domain 不変条件 + usecase 2 + DI 2 + tester 1）」と数えているが、`updateSpeechConfig` が draft を作った直後に呼ぶ `AdminSettingsService.assertSpeechEnvOverride`（domain service）が **6 番目のゲート**で、しかも plan ステップ 4(b) の正規化（`apiKeySource:'env'` 化）が**このゲートを能動的に踏み抜く**。ここが未対応だと keyless の保存が別の `BusinessRuleError` で失敗し、AC-3（保存）が満たせない。

---

#### 検証済みの前提（round-1 指摘の反映 — すべて正しく反映）

- 実コード確認: `updateSpeechConfig.ts` L66-74 の `providerChanged && apiKeyCiphertext === null → SpeechProviderChangedRequiresApiKey` throw、L76-89 の else 枝が旧 `apiKeySource`/`apiKeyCiphertext` を流用する構造は plan 記述どおり。ステップ 4 の「免除 + `env`/null 明示正規化」で両方に手当てされている。
- `testSpeechConnection.ts` L80-86 の `resolvedKey` 空 early-return、`speechConnectionTester.ts` L37-39 の `trimmedKey.length === 0 → "API key is empty"` 短絡も実在。ステップ 5/9 で keyless バイパスが明記されている。
- DI: `buildSpeechRecognitionProvider`（L625-641、現状 3 引数 `if (!adminSpeechApiKey || !adminSpeechModel) return Stub`）、`resolveConsumerSpeechConfig` L1192 の 3 項 early-return も plan 記述どおり。ステップ 7/8 の分岐式（keyless で apiKey null 許容）は妥当。
- `registry.ts` の `Record<SpeechProviderId, SpeechAdapter>`・`SpeechAdapterConfig = { apiKey, model }`・`create(c)` 単一引数も確認。ステップ 2 の `deps?` optional 追加が REST barrel を無改修に保つ主張は型的に成立。
- keyless 述語を domain に置く配置は正しい。`assertSpeechEnvOverride`（下記 P-001）も domain service なので、同じ `SpeechRecognitionConfig.requiresApiKey` を参照でき、SSOT を domain に置いた判断がむしろ**補強**される。

---

#### 問題点（要修正）

- **[P-001] `AdminSettingsService.assertSpeechEnvOverride`（domain service）が 6 番目の apiKey ゲートで、plan ステップ 4(b) の `apiKeySource:'env'` 正規化がこれを踏み抜き、keyless 保存が `SpeechEnvOverrideMissingKey` で失敗する。plan/ADR-004 の「5 箇所」列挙に漏れがある。**
  - 根拠: `updateSpeechConfig.ts` L91 で draft を作った直後に `reconciled = AdminSettingsService.assertSpeechEnvOverride(draft, env)` を呼ぶ。この domain service（`service.ts` L94-114）は
    ```
    if (env.apiKey === null || env.apiKey.length === 0) {
      if (cfg.apiKeySource === "env") {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.SpeechEnvOverrideMissingKey,
          "Speech apiKeySource is 'env' but no env-provided api key is available",
        );
      }
      return cfg;
    }
    ```
    workers-ai は鍵が無いので管理者は `ADMIN_SPEECH_API_KEY` を設定せず、`env.apiKey`（`container.adminSpeechEnv.apiKey`）は null。一方 plan ステップ 4(b) は keyless draft を **`apiKeySource:'env'`** に正規化する（VO は `env`|`db` の 2 択で、`db` は非空 ciphertext 必須ゆえ keyless の唯一の表現が `env`/null）。結果、`env.apiKey===null && cfg.apiKeySource==='env'` の条件が成立し **`SpeechEnvOverrideMissingKey` を throw** して保存が失敗する。ステップ 4 の L68-74 免除だけでは通らない（免除の下流でもう一度別の理由で落ちる）。
  - なぜ漏れたか: ADR-004 は apiKey ゲートを「DI 2 + domain 不変条件/usecase 3 = 5」と数え、`assertSpeechEnvOverride` の env-source×env-key-missing 分岐を勘定していない。この分岐は「apiKeySource が env なら env キーが必ず要る」という REST 前提の不変条件で、keyless（キー自体が binding 側）とは前提が食い違う。
  - 提案: keyless の carve-out を **domain service `assertSpeechEnvOverride` に入れる**。`SpeechRecognitionConfig.requiresApiKey(cfg.provider) === false` のとき、env キー欠如でも throw せず `cfg`（`env`/null のまま）を返す分岐を先頭に足す。判定は P-001（round-1）で domain SSOT に置くと決めた同一述語を参照するので依存方向は保たれ、むしろ SSOT を domain に置いた判断と整合する。plan ステップ 1/4・ADR-004 の「5 箇所」を **6 箇所（+ domain service `assertSpeechEnvOverride`）** に更新し、テスト方針（ステップ 11）に「keyless 切替を env キー無しで保存でき `SpeechEnvOverrideMissingKey` で落ちない」回帰ケースを追加する。

---

#### 改善提案（検討推奨）

- **[S-001] `SpeechProviderChangedRequiresApiKey` を「ドメイン不変条件」と呼ぶ表現の精度。** plan/ADR-004 は繰り返し「ドメイン不変条件」と記すが、実際の throw は application usecase `updateSpeechConfig.ts` L68-74（`BusinessRuleError` + domain の `AdminSettingsErrorCode`）で行われ、enforcement は application 層にある（domain VO の `create` は provider 変更×鍵の関係を検査しない）。keyless 述語を domain VO の SSOT に置く判断自体は正しいので設計に影響はないが、ADR の文言を「domain のエラーコードを使う application usecase の不変条件」に整えると、P-001 で `assertSpeechEnvOverride`（こちらは真に domain service）と混同せずに済む。

- **[S-002] keyless で operator が誤って apiKey を入力した場合の扱いを明記。** ステップ 4(b) は keyless を無条件に `env`/null 正規化する方針なので、UI 側の抑制をすり抜けて `apiKeyPlain !== null` が来ても鍵は捨てられる（L48-51 の encrypt は走るが draft では無視される）想定と読める。これは安全側で妥当だが、「keyless では入力鍵を silently drop する」旨を usecase JSDoc / テストに 1 行残すと、将来「鍵が保存されない」バグ報告との切り分けが早い。

---

#### 良い点

- round-1 の P-001/P-002/S-001〜S-004 を漏れなく取り込み、keyless 述語を **domain SSOT** に一元化して 4〜5 経路が同一述語を参照する設計に改稿した点。依存方向（domain は binding 非依存、application/DI は薄い委譲ラッパ）が正しく保たれている。
- `SpeechAdapterConfig` を純データ据え置きにし binding を `deps.ai` 別口注入する ADR-002 が、実 `registry.ts` の `create(c)` 単一引数構造と最小差分で両立する点を型で裏取りできている。`deps?` optional で REST 3 barrel を無改修に保つ主張も成立。
- ADR-006 の「型契約で静的 PoC + staging implement-then-verify/revert」と偽陽性（`runIngestionJob` の `SpeechFailureError` 握り潰し）への警戒、DoD とクローズ条件の分離（マージ可否と staging 確定項目を切り分け）は、実 binding 到達不可という制約への現実的な着地。
- consumer 経路（`resolveConsumerSpeechConfig` + `[env.consumer]` の `[ai]` binding）を E2E の要と名指しし、沈黙 Stub リスクを DI unit テストで固める方針は blast radius 管理として的確。

---

#### まとめ

round-1 指摘は全反映。設計（案 B・`deps.ai` 注入・keyless 述語を domain SSOT）と依存方向は妥当で実装可能。ただし apiKey ゲートの列挙がなお 1 箇所不足しており、`updateSpeechConfig` が呼ぶ domain service `assertSpeechEnvOverride` が、plan 自身の `apiKeySource:'env'` 正規化によって `SpeechEnvOverrideMissingKey` を throw して keyless 保存を再度ブロックする（P-001）。keyless carve-out を `assertSpeechEnvOverride` に足し、ゲート数を「5 → 6」に改め、回帰テストを 1 ケース追加すれば AC-3 保存経路が完結する。他は問題なし。
